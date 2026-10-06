export const ADMIN_ROLES = ["super_admin", "moderator", "support"];

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
];

const permissionsByRole = {
  super_admin: new Set(ADMIN_PERMISSIONS),
  moderator: new Set([
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
  ]),
  support: new Set([
    "dashboard.read",
    "users.read",
    "reports.read",
    "audit.read",
  ]),
};

export function hasAdminPermission(role, permission) {
  return ADMIN_ROLES.includes(role) && permissionsByRole[role].has(permission);
}

export function permissionsForRole(role) {
  if (!role || !ADMIN_ROLES.includes(role)) return [];
  return ADMIN_PERMISSIONS.filter((permission) => hasAdminPermission(role, permission));
}

export function canAssignAdminRole(actorRole, targetRole) {
  return targetRole !== "super_admin" || actorRole === "super_admin";
}

export function canUpdateAccountStatus(actorRole, status) {
  return status !== "deleted" || actorRole === "super_admin";
}

export function isSupportedModerationAction(entityType, action) {
  if (action === "restore") return true;
  if (entityType === "business" || entityType === "service_provider") {
    return action === "suspend" || action === "unsuspend";
  }
  if (action === "suspend" || action === "unsuspend") return false;
  return action === "hide" || action === "remove";
}

export function moderatedProfileStatus(action, previousStatus) {
  if (action === "suspend") return "suspended";
  return typeof previousStatus === "string" ? previousStatus : "pending";
}

export function mergeDailyActiveUsers(dayMap, rows, getDay) {
  for (const row of rows) {
    getDay(row.day).dailyActiveUsers = Number(row.activeUsers);
  }
}

export function auditSuccessMetadata(metadata) {
  const details = metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? metadata
    : metadata === undefined ? {} : { details: metadata };
  return { ...details, result: "success" };
}
