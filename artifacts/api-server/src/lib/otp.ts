import { randomUUID, timingSafeEqual } from "node:crypto";
import { and, desc, eq, gt, isNull, lt, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { otpChallenges } from "@workspace/db/schema";
import { generateLocalOtp, hashOtp, normalizePhone } from "./auth";
import { consumeRateLimit } from "./rate-limit";

export interface OtpProvider {
  send(phone: string): Promise<{ code: string; expiresAt: Date }>;
}

export class LocalOtpProvider implements OtpProvider {
  async send(_phone: string) {
    return {
      code: generateLocalOtp(),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    };
  }
}

export const otpProvider: OtpProvider = new LocalOtpProvider();

export class OtpRateLimitError extends Error {
  constructor() {
    super("Too many OTP requests. Try again later.");
    this.name = "OtpRateLimitError";
  }
}

export class OtpVerificationError extends Error {
  constructor() {
    super("Invalid or expired code");
    this.name = "OtpVerificationError";
  }
}

export async function createOtpChallenge(phoneInput: string, ip = "unknown") {
  const phone = normalizePhone(phoneInput);
  if (!consumeRateLimit(`otp:${ip}:${phone}`, 5, 10 * 60 * 1000)) throw new OtpRateLimitError();
  const { code, expiresAt } = await otpProvider.send(phone);
  const [challenge] = await db
    .insert(otpChallenges)
    .values({ id: randomUUID(), phone, codeHash: hashOtp(code), expiresAt })
    .returning({ id: otpChallenges.id, expiresAt: otpChallenges.expiresAt });
  return { challengeId: challenge.id, expiresAt, developmentOtp: process.env.NODE_ENV === "production" ? null : code };
}

export async function consumeOtp(phoneInput: string, code: string) {
  let phone: string;
  try {
    phone = normalizePhone(phoneInput);
  } catch {
    throw new OtpVerificationError();
  }
  const now = new Date();
  const [challenge] = await db
    .select()
    .from(otpChallenges)
    .where(and(eq(otpChallenges.phone, phone), isNull(otpChallenges.consumedAt), gt(otpChallenges.expiresAt, now)))
    .orderBy(desc(otpChallenges.createdAt))
    .limit(1);
  if (!challenge || challenge.attempts >= 5) throw new OtpVerificationError();

  const expectedHash = Buffer.from(challenge.codeHash, "hex");
  const actualHash = Buffer.from(hashOtp(code), "hex");
  const isValid = expectedHash.length === actualHash.length && timingSafeEqual(expectedHash, actualHash);
  const activeChallenge = and(
    eq(otpChallenges.id, challenge.id),
    isNull(otpChallenges.consumedAt),
    gt(otpChallenges.expiresAt, new Date()),
    lt(otpChallenges.attempts, 5),
  );

  if (isValid) {
    const [consumed] = await db
      .update(otpChallenges)
      .set({ consumedAt: new Date() })
      .where(activeChallenge)
      .returning({ id: otpChallenges.id });
    if (!consumed) throw new OtpVerificationError();
    return phone;
  }

  await db
    .update(otpChallenges)
    .set({ attempts: sql`${otpChallenges.attempts} + 1` })
    .where(activeChallenge);
  throw new OtpVerificationError();
}