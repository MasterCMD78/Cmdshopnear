import { db } from "@workspace/db";
import { auditLogs } from "@workspace/db/schema";
import type { Request } from "express";
import { auditSuccessMetadata } from "./admin-policy.mjs";

export async function audit(req: Request, action: string, entityType?: string, entityId?: string, metadata?: unknown) {
  try {
    await db.insert(auditLogs).values({
      actorUserId: req.user?.id,
      action,
      entityType,
      entityId,
      ipAddress: req.ip,
      metadata: auditSuccessMetadata(metadata),
    });
  } catch (error) {
    req.log.error({ err: error, action }, "Audit log write failed");
  }
}