import { randomUUID } from "node:crypto";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { db } from "@workspace/db";
import { otpChallenges } from "@workspace/db/schema";
import { generateLocalOtp, hashOtp, normalizePhone } from "./auth";

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

const requestWindows = new Map<string, number[]>();

function rateLimit(key: string) {
  const now = Date.now();
  const current = (requestWindows.get(key) ?? []).filter((time) => now - time < 10 * 60 * 1000);
  if (current.length >= 5) return false;
  current.push(now);
  requestWindows.set(key, current);
  return true;
}

export async function createOtpChallenge(phoneInput: string, ip = "unknown") {
  const phone = normalizePhone(phoneInput);
  if (!rateLimit(`${ip}:${phone}`)) throw new Error("Too many OTP requests. Try again later.");
  const { code, expiresAt } = await otpProvider.send(phone);
  const [challenge] = await db
    .insert(otpChallenges)
    .values({ id: randomUUID(), phone, codeHash: hashOtp(code), expiresAt })
    .returning({ id: otpChallenges.id, expiresAt: otpChallenges.expiresAt });
  return { challengeId: challenge.id, expiresAt, developmentOtp: process.env.NODE_ENV === "production" ? null : code };
}

export async function consumeOtp(phoneInput: string, code: string) {
  const phone = normalizePhone(phoneInput);
  const [challenge] = await db
    .select()
    .from(otpChallenges)
    .where(and(eq(otpChallenges.phone, phone), isNull(otpChallenges.consumedAt), gt(otpChallenges.expiresAt, new Date())))
    .orderBy(desc(otpChallenges.createdAt))
    .limit(1);
  if (!challenge || challenge.attempts >= 5) throw new Error("Invalid or expired code");
  await db.update(otpChallenges).set({ attempts: challenge.attempts + 1 }).where(eq(otpChallenges.id, challenge.id));
  if (hashOtp(code) !== challenge.codeHash) throw new Error("Invalid or expired code");
  await db.update(otpChallenges).set({ consumedAt: new Date() }).where(eq(otpChallenges.id, challenge.id));
  return phone;
}