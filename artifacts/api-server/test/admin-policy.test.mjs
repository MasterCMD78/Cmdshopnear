import assert from "node:assert/strict";
import test from "node:test";
import {
  ADMIN_PERMISSIONS,
  auditSuccessMetadata,
  canAssignAdminRole,
  canUpdateAccountStatus,
  hasAdminPermission,
  isSupportedModerationAction,
  mergeDailyActiveUsers,
  moderatedProfileStatus,
  permissionsForRole,
} from "../src/lib/admin-policy.mjs";

test("staff roles grant only their documented permissions", () => {
  assert.deepEqual(permissionsForRole("super_admin"), [...ADMIN_PERMISSIONS]);
  assert.equal(hasAdminPermission("moderator", "users.manage"), true);
  assert.equal(hasAdminPermission("moderator", "roles.manage"), false);
  assert.equal(hasAdminPermission("moderator", "settings.manage"), false);
  assert.equal(hasAdminPermission("support", "users.read"), true);
  assert.equal(hasAdminPermission("support", "users.manage"), false);
  assert.deepEqual(permissionsForRole(null), []);
});

test("only a super administrator can assign that role or soft-delete an account", () => {
  assert.equal(canAssignAdminRole("moderator", "support"), true);
  assert.equal(canAssignAdminRole("moderator", "super_admin"), false);
  assert.equal(canAssignAdminRole("super_admin", "super_admin"), true);
  assert.equal(canUpdateAccountStatus("moderator", "suspended"), true);
  assert.equal(canUpdateAccountStatus("moderator", "active"), true);
  assert.equal(canUpdateAccountStatus("moderator", "deleted"), false);
  assert.equal(canUpdateAccountStatus("super_admin", "deleted"), true);
});

test("moderation actions are constrained by entity type and profile suspension is reversible", () => {
  assert.equal(isSupportedModerationAction("business", "suspend"), true);
  assert.equal(isSupportedModerationAction("service_provider", "unsuspend"), true);
  assert.equal(isSupportedModerationAction("business", "remove"), false);
  assert.equal(isSupportedModerationAction("product", "hide"), true);
  assert.equal(isSupportedModerationAction("review", "remove"), true);
  assert.equal(isSupportedModerationAction("chat_message", "suspend"), false);
  assert.equal(moderatedProfileStatus("suspend", "approved"), "suspended");
  assert.equal(moderatedProfileStatus("unsuspend", "approved"), "approved");
});

test("daily active totals use the distinct-per-day result instead of a per-event maximum", () => {
  const days = new Map([["2026-10-06", { dailyActiveUsers: 2 }]]);
  mergeDailyActiveUsers(days, [{ day: "2026-10-06", activeUsers: "4" }], (date) => {
    if (!days.has(date)) days.set(date, { dailyActiveUsers: 0 });
    return days.get(date);
  });
  assert.equal(days.get("2026-10-06").dailyActiveUsers, 4);
});

test("audit metadata records a successful outcome without losing action details", () => {
  assert.deepEqual(auditSuccessMetadata({ requestId: "request-1" }), {
    requestId: "request-1",
    result: "success",
  });
  assert.deepEqual(auditSuccessMetadata(), { result: "success" });
  assert.deepEqual(auditSuccessMetadata("note"), { details: "note", result: "success" });
});
