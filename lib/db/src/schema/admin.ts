import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./auth";

export const adminRoleAssignments = pgTable("admin_role_assignments", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  assignedById: uuid("assigned_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  onlyOneSuperAdminIdx: uniqueIndex("admin_role_assignments_single_super_admin_idx")
    .on(table.role)
    .where(sql`${table.role} = 'super_admin'`),
}));

export const verificationRequests = pgTable("verification_requests", {
  id: uuid("id").defaultRandom().primaryKey(),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id").notNull(),
  ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  applicantNote: text("applicant_note"),
  status: text("status").notNull().default("pending"),
  adminNote: text("admin_note"),
  reviewedById: uuid("reviewed_by_id").references(() => users.id, { onDelete: "set null" }),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  targetCreatedIdx: index("verification_requests_target_created_idx").on(table.entityType, table.entityId, table.createdAt),
  queueIdx: index("verification_requests_queue_idx").on(table.status, table.entityType, table.createdAt),
  ownerCreatedIdx: index("verification_requests_owner_created_idx").on(table.ownerId, table.createdAt),
}));

export const verificationHistory = pgTable("verification_history", {
  id: uuid("id").defaultRandom().primaryKey(),
  requestId: uuid("request_id").references(() => verificationRequests.id, { onDelete: "set null" }),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id").notNull(),
  previousStatus: text("previous_status"),
  newStatus: text("new_status").notNull(),
  note: text("note"),
  actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  targetCreatedIdx: index("verification_history_target_created_idx").on(table.entityType, table.entityId, table.createdAt),
  actorCreatedIdx: index("verification_history_actor_created_idx").on(table.actorUserId, table.createdAt),
}));

export const analyticsEvents = pgTable("analytics_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  eventType: text("event_type").notNull(),
  entityType: text("entity_type"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  eventCreatedIdx: index("analytics_events_event_created_idx").on(table.eventType, table.createdAt),
  userCreatedIdx: index("analytics_events_user_created_idx").on(table.userId, table.createdAt),
}));

export const moderationActions = pgTable("moderation_actions", {
  id: uuid("id").defaultRandom().primaryKey(),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id").notNull(),
  action: text("action").notNull(),
  previousState: jsonb("previous_state").$type<Record<string, unknown>>(),
  actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  restoredAt: timestamp("restored_at", { withTimezone: true }),
}, (table) => ({
  targetCreatedIdx: index("moderation_actions_target_created_idx").on(table.entityType, table.entityId, table.createdAt),
  activeIdx: index("moderation_actions_active_idx").on(table.restoredAt, table.createdAt),
}));

export type AdminRoleAssignment = typeof adminRoleAssignments.$inferSelect;
export type VerificationRequest = typeof verificationRequests.$inferSelect;
export type VerificationHistoryEntry = typeof verificationHistory.$inferSelect;
export type AnalyticsEvent = typeof analyticsEvents.$inferSelect;
export type ModerationAction = typeof moderationActions.$inferSelect;
