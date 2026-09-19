import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq } from "drizzle-orm";
import {
  GetSessionResponse,
  LoginResponse,
  LogoutResponse,
  RegisterBody,
  RegisterResponse,
  RequestOtpBody,
  RequestOtpResponse,
  VerifyOtpBody,
  VerifyOtpResponse,
} from "@workspace/api-zod";
import { db } from "@workspace/db";
import { sessions, users } from "@workspace/db/schema";
import { audit } from "../lib/audit";
import {
  clearAuthCookies,
  createSession,
  getOnboardingPhone,
  loadSession,
  normalizePhone,
  serializeUser,
  setOnboardingCookie,
} from "../lib/auth";
import { consumeOtp, createOtpChallenge } from "../lib/otp";

const router: IRouter = Router();

async function requestOtp(req: Request, res: Response) {
  const parsed = RequestOtpBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a valid phone number" });
    return;
  }
  try {
    const result = await createOtpChallenge(parsed.data.phone, req.ip);
    res.json(RequestOtpResponse.parse(result));
  } catch (error) {
    res.status(429).json({ error: error instanceof Error ? error.message : "Unable to send OTP" });
  }
}

router.post("/auth/request-otp", requestOtp);
router.post("/login", requestOtp);

async function verifyOtp(req: Request, res: Response) {
  const parsed = VerifyOtpBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter the six-digit code" });
    return;
  }
  try {
    const phone = await consumeOtp(parsed.data.phone, parsed.data.code);
    const [user] = await db.select().from(users).where(eq(users.phone, phone)).limit(1);
    if (!user) {
      setOnboardingCookie(phone, res);
      const result = { authenticated: false, needsRegistration: true, phone, user: null };
      res.json(VerifyOtpResponse.parse(result));
      await audit(req, "otp.verified", "phone", phone);
      return;
    }
    await db.update(users).set({ phoneVerifiedAt: new Date(), updatedAt: new Date() }).where(eq(users.id, user.id));
    await createSession({ ...user, phoneVerifiedAt: new Date() }, req, res);
    const result = { authenticated: true, needsRegistration: false, phone, user: serializeUser(user) };
    res.json(VerifyOtpResponse.parse(result));
    await audit(req, "auth.login", "user", user.id);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Invalid or expired code" });
  }
}

router.post("/auth/verify-otp", verifyOtp);
router.post("/verify-otp", verifyOtp);

router.get("/auth/session", async (req, res) => {
  const user = await loadSession(req);
  if (!user) {
    res.status(401).json({ error: "No active session" });
    return;
  }
  res.json(GetSessionResponse.parse({ authenticated: true, needsRegistration: false, phone: user.phone, user: serializeUser(user) }));
});

router.post("/register", async (req, res) => {
  const parsed = RegisterBody.safeParse(req.body);
  const phone = getOnboardingPhone(req);
  if (!parsed.success || !phone) {
    res.status(400).json({ error: "Verify your phone before registering" });
    return;
  }
  try {
    const normalizedPhone = normalizePhone(phone);
    const [existing] = await db.select().from(users).where(eq(users.phone, normalizedPhone)).limit(1);
    if (existing) {
      res.status(409).json({ error: "An account already exists for this phone" });
      return;
    }
    const [user] = await db
      .insert(users)
      .values({
        fullName: parsed.data.fullName.trim(),
        phone: normalizedPhone,
        accountType: parsed.data.accountType,
        city: parsed.data.city,
        state: parsed.data.state,
        address: parsed.data.address,
        preferredLanguage: parsed.data.preferredLanguage ?? "en",
        notificationsEnabled: parsed.data.notificationsEnabled ?? true,
        phoneVerifiedAt: new Date(),
      })
      .returning();
    clearAuthCookies(res);
    await createSession(user, req, res);
    const result = { authenticated: true, needsRegistration: false, phone: user.phone, user: serializeUser(user) };
    res.status(201).json(RegisterResponse.parse(result));
    await audit(req, "auth.register", "user", user.id, { accountType: user.accountType });
  } catch (error) {
    req.log.error({ err: error }, "Registration failed");
    res.status(500).json({ error: "Unable to create account" });
  }
});

router.post("/auth/logout", async (req, res) => {
  const sessionToken = req.cookies?.shopnear_session;
  if (sessionToken) {
    const user = await loadSession(req);
    if (req.sessionId) await db.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.id, req.sessionId), eq(sessions.tokenHash, (await import("../lib/auth")).hashToken(sessionToken))));
    if (user) await audit(req, "auth.logout", "user", user.id);
  }
  clearAuthCookies(res);
  res.json(LogoutResponse.parse({ message: "Logged out" }));
});

export default router;