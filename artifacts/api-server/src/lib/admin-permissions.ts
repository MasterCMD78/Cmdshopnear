import type { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { adminRoleAssignments } from "@workspace/db/schema";

export const ADMIN_ROLES = ["super_admin", "moderator", "support"] as const;
export type AdminStaffRole = (typeof ADMIN_ROLES)[number];

export const ADMIN_PERMISSIONS = [
  "dashboard.read",
  "verification.read",
  "verification.review",
  "users.read",
  "users.manage",
  "reports.read",
  "reports.manage",
  "moderation.manage",
  "analytics.read",
  "audit.read",
  "settings.read",
  "settings.manage",
  "categories.manage",
  "announcements.manage",
  "roles.manage",
] as const;
export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

const permissionsByRole: Record<AdminStaffRole, ReadonlySet<AdminPermission>> = {
  super_admin: new Set(ADMIN_PERMISSIONS),
  moderator: new Set([
    "dashboard.read",
    "verification.read",
    "verification.review",
    "reports.read",
    "reports.manage",
    "moderation.manage",
    "analytics.read",
    "audit.read",
  ]),
  support: new Set([
    "dashboard.read",
    "users.read",
    "reports.read",
    "audit.read",
  ]),
};

export function hasAdminPermission(role: string, permission: AdminPermission) {
  return ADMIN_ROLES.includes(role as AdminStaffRole)
    && permissionsByRole[role as AdminStaffRole].has(permission);
}

export function permissionsForRole(role: string | null) {
  if (!role || !ADMIN_ROLES.includes(role as AdminStaffRole)) return [];
  return ADMIN_PERMISSIONS.filter((permission) => hasAdminPermission(role, permission));
}

export function requirePermission(permission: AdminPermission) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user || req.user.accountType !== "admin") {
      res.status(403).json({ error: "Administrator account required" });
      return;
    }
    const userId = req.user.id;
    try {
      const [assignment] = await db.select({ role: adminRoleAssignments.role })
        .from(adminRoleAssignments)
        .where(eq(adminRoleAssignments.userId, userId))
        .limit(1);
      if (!assignment || !hasAdminPermission(assignment.role, permission)) {
        res.status(403).json({ error: "This administrator role does not allow that action" });
        return;
      }
      next();
    } catch (error) {
      req.log.error({ err: error, permission }, "Admin permission check failed");
      res.status(500).json({ error: "Could not verify administrator permissions" });
    }
  };
}

export async function getAdminRole(userId: string) {
  const [assignment] = await db.select({ role: adminRoleAssignments.role })
    .from(adminRoleAssignments)
    .where(eq(adminRoleAssignments.userId, userId))
    .limit(1);
  return assignment?.role ?? null;
}
