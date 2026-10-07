export const ADMIN_ROLES: readonly ["super_admin", "moderator", "support"];

export const ADMIN_PERMISSIONS: readonly [
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

export type AdminRole = (typeof ADMIN_ROLES)[number];
export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

export function hasAdminPermission(role: string, permission: AdminPermission): boolean;
export function permissionsForRole(role: string | null): AdminPermission[];
export function canAssignAdminRole(actorRole: string | null, targetRole: string): boolean;
export function requiresSuperAdminTransfer(currentRole: string | null | undefined, nextRole: string): boolean;
export function canUpdateAccountStatus(actorRole: string | null, status: string): boolean;
export function isSupportedModerationAction(entityType: string, action: string): boolean;
export function moderatedProfileStatus(action: string, previousStatus: unknown): string;
export function mergeDailyActiveUsers(
  dayMap: Map<string, { dailyActiveUsers: number }>,
  rows: readonly { day: string; activeUsers: number | string }[],
  getDay: (date: string) => { dailyActiveUsers: number },
): void;
export function auditSuccessMetadata(metadata: unknown): Record<string, unknown>;
