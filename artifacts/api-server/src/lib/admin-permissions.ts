import type { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { adminRoleAssignments } from "@workspace/db/schema";
import {
  ADMIN_PERMISSIONS,
  ADMIN_ROLES,
  hasAdminPermission as policyHasAdminPermission,
  permissionsForRole as policyPermissionsForRole,
  type AdminPermission,
  type AdminRole,
} from "./admin-policy.mjs";

export { ADMIN_PERMISSIONS, ADMIN_ROLES } from "./admin-policy.mjs";
export type AdminStaffRole = AdminRole;
export type { AdminPermission };

export function hasAdminPermission(role: string, permission: AdminPermission) {
  return policyHasAdminPermission(role, permission);
}

export function permissionsForRole(role: string | null) {
  return policyPermissionsForRole(role);
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
