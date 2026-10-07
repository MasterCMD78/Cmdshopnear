import { createHash, createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@workspace/db";
import { sessions, users, type User } from "@workspace/db/schema";

export type Role = "customer" | "business" | "service_provider" | "admin";

type TokenPayload = {
  sub: string;
  sid: string;
  role: Role;
  exp: number;
  purpose: "session" | "onboarding";
};

declare global {
  namespace Express {
    interface Request {
      user?: User;
      sessionId?: string;
    }
  }
}

const SESSION_COOKIE = "shopnear_session";
const ONBOARDING_COOKIE = "shopnear_onboarding";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const ONBOARDING_TTL_SECONDS = 60 * 15;
const tokenIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const roles = new Set<Role>(["customer", "business", "service_provider", "admin"]);

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value) throw new Error("SESSION_SECRET must be configured");
  return value;
}

function base64url(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

function sign(payload: TokenPayload) {
  const body = base64url(JSON.stringify(payload));
  const signature = base64url(createHmac("sha256", secret()).update(body).digest());
  return `${body}.${signature}`;
}

function verify(token: string): TokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, signature] = parts;
  if (!body || !signature) return null;
  const expected = createHmac("sha256", secret()).update(body).digest();
  const received = Buffer.from(signature, "base64url");
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
  try {
    const payload: unknown = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (
      typeof payload !== "object" ||
      payload === null ||
      !("sub" in payload) ||
      typeof payload.sub !== "string" ||
      payload.sub.length === 0 ||
      !("sid" in payload) ||
      typeof payload.sid !== "string" ||
      !tokenIdPattern.test(payload.sid) ||
      !("role" in payload) ||
      typeof payload.role !== "string" ||
      !roles.has(payload.role as Role) ||
      !("exp" in payload) ||
      typeof payload.exp !== "number" ||
      !Number.isSafeInteger(payload.exp) ||
      !("purpose" in payload) ||
      (payload.purpose !== "session" && payload.purpose !== "onboarding")
    ) {
      return null;
    }
    const validPayload = payload as TokenPayload;
    return validPayload.exp > Math.floor(Date.now() / 1000) ? validPayload : null;
  } catch {
    return null;
  }
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function normalizePhone(phone: string) {
  const normalized = phone.trim().replace(/[\s()-]/g, "");
  if (!/^\+?[0-9]{7,15}$/.test(normalized)) throw new Error("Enter a valid phone number");
  return normalized;
}

export function serializeUser(user: User) {
  return {
    id: user.id,
    fullName: user.fullName,
    phone: user.phone,
    email: user.email,
    accountType: user.accountType as Role,
    profilePhoto: user.profilePhoto,
    city: user.city,
    state: user.state,
    address: user.address,
    preferredLanguage: user.preferredLanguage,
    notificationsEnabled: user.notificationsEnabled,
    status: user.status,
    createdAt: user.createdAt,
  };
}

export async function createSession(user: User, req: Request, res: Response) {
  const sessionId = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  const token = sign({
    sub: user.id,
    sid: sessionId,
    role: user.accountType as Role,
    exp: Math.floor(expiresAt.getTime() / 1000),
    purpose: "session",
  });
  await db.insert(sessions).values({
    id: sessionId,
    userId: user.id,
    tokenHash: hashToken(token),
    expiresAt,
    userAgent: req.get("user-agent")?.slice(0, 300),
    ipAddress: req.ip,
  });
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_TTL_SECONDS * 1000,
    path: "/",
  });
}

export function setOnboardingCookie(phone: string, res: Response) {
  const token = sign({
    sub: phone,
    sid: randomUUID(),
    role: "customer",
    exp: Math.floor(Date.now() / 1000) + ONBOARDING_TTL_SECONDS,
    purpose: "onboarding",
  });
  res.cookie(ONBOARDING_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: ONBOARDING_TTL_SECONDS * 1000,
    path: "/",
  });
}

export function getOnboardingPhone(req: Request) {
  const token = req.cookies?.[ONBOARDING_COOKIE];
  const payload = token ? verify(token) : null;
  return payload?.purpose === "onboarding" ? payload.sub : null;
}

export function clearAuthCookies(res: Response) {
  const secure = process.env.NODE_ENV === "production";
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, secure, sameSite: "lax", path: "/" });
  res.clearCookie(ONBOARDING_COOKIE, { httpOnly: true, secure, sameSite: "lax", path: "/" });
}

export async function loadSession(req: Request) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return null;
  const payload = verify(token);
  if (!payload || payload.purpose !== "session") return null;
  const [session] = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, payload.sid), eq(sessions.tokenHash, hashToken(token)), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())))
    .limit(1);
  if (
    !session ||
    session.user.status !== "active" ||
    session.user.id !== payload.sub ||
    session.user.accountType !== payload.role
  ) {
    return null;
  }
  req.user = session.user;
  req.sessionId = session.session.id;
  return session.user;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    if (await loadSession(req)) return next();
    res.status(401).json({ error: "Authentication required" });
  } catch (error) {
    req.log.error({ err: error }, "Session validation failed");
    res.status(401).json({ error: "Authentication required" });
  }
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.accountType as Role)) {
      res.status(403).json({ error: "Insufficient permissions" });
      return;
    }
    next();
  };
}

export function generateLocalOtp() {
  return process.env.NODE_ENV === "production" ? String(randomInt(100000, 999999)) : "123456";
}

export function hashOtp(code: string) {
  return createHash("sha256").update(code).digest("hex");
}