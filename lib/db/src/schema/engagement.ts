import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  index,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { users } from "./auth";

export const chatConversations = pgTable("chat_conversations", {
  id: uuid("id").defaultRandom().primaryKey(),
  participantOneId: uuid("participant_one_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  participantTwoId: uuid("participant_two_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  directKey: text("direct_key").notNull().unique(),
  contextType: text("context_type"),
  contextId: uuid("context_id"),
  createdById: uuid("created_by_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  participantsIdx: index("chat_conversations_participants_idx").on(table.participantOneId, table.participantTwoId),
  lastMessageIdx: index("chat_conversations_last_message_idx").on(table.lastMessageAt),
}));

export const chatParticipants = pgTable("chat_participants", {
  id: uuid("id").defaultRandom().primaryKey(),
  conversationId: uuid("conversation_id").notNull().references(() => chatConversations.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  lastReadAt: timestamp("last_read_at", { withTimezone: true }),
  hiddenAt: timestamp("hidden_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  conversationUserIdx: uniqueIndex("chat_participants_conversation_user_idx").on(table.conversationId, table.userId),
  userConversationIdx: index("chat_participants_user_conversation_idx").on(table.userId, table.conversationId),
}));

export const chatMessages = pgTable("chat_messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  conversationId: uuid("conversation_id").notNull().references(() => chatConversations.id, { onDelete: "cascade" }),
  senderId: uuid("sender_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  messageType: text("message_type").notNull().default("text"),
  body: text("body").notNull(),
  metadata: jsonb("metadata"),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  deletedByUserId: uuid("deleted_by_user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  conversationCreatedIdx: index("chat_messages_conversation_created_idx").on(table.conversationId, table.createdAt),
  senderIdx: index("chat_messages_sender_idx").on(table.senderId, table.createdAt),
}));

export const userBlocks = pgTable("user_blocks", {
  id: uuid("id").defaultRandom().primaryKey(),
  blockerId: uuid("blocker_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  blockedId: uuid("blocked_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  blockPairIdx: uniqueIndex("user_blocks_pair_idx").on(table.blockerId, table.blockedId),
  blockedIdx: index("user_blocks_blocked_idx").on(table.blockedId),
}));

export const contentReports = pgTable("content_reports", {
  id: uuid("id").defaultRandom().primaryKey(),
  reporterId: uuid("reporter_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id").notNull(),
  reason: text("reason").notNull(),
  details: text("details"),
  status: text("status").notNull().default("open"),
  reviewedById: uuid("reviewed_by_id").references(() => users.id, { onDelete: "set null" }),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  entityCreatedIdx: index("content_reports_entity_created_idx").on(table.entityType, table.entityId, table.createdAt),
  statusCreatedIdx: index("content_reports_status_created_idx").on(table.status, table.createdAt),
}));

export const notifications = pgTable("notifications", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  entityType: text("entity_type"),
  entityId: uuid("entity_id"),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userCreatedIdx: index("notifications_user_created_idx").on(table.userId, table.createdAt),
  userReadIdx: index("notifications_user_read_idx").on(table.userId, table.readAt),
}));

export const notificationPreferences = pgTable("notification_preferences", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  messages: boolean("messages").notNull().default(true),
  favorites: boolean("favorites").notNull().default(true),
  verification: boolean("verification").notNull().default(true),
  reviews: boolean("reviews").notNull().default(true),
  ratings: boolean("ratings").notNull().default(true),
  announcements: boolean("announcements").notNull().default(true),
  accountActivity: boolean("account_activity").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const reviews = pgTable("reviews", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  targetType: text("target_type").notNull(),
  targetId: uuid("target_id").notNull(),
  rating: integer("rating").notNull(),
  comment: text("comment"),
  photoPaths: jsonb("photo_paths"),
  verifiedCustomer: boolean("verified_customer").notNull().default(false),
  moderationStatus: text("moderation_status").notNull().default("visible"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userTargetIdx: uniqueIndex("reviews_user_target_idx").on(table.userId, table.targetType, table.targetId),
  targetCreatedIdx: index("reviews_target_created_idx").on(table.targetType, table.targetId, table.createdAt),
  moderationIdx: index("reviews_moderation_idx").on(table.moderationStatus, table.createdAt),
}));

export const insertChatConversationSchema = createInsertSchema(chatConversations);
export const insertChatMessageSchema = createInsertSchema(chatMessages);
export const insertNotificationSchema = createInsertSchema(notifications);
export const insertReviewSchema = createInsertSchema(reviews);

export type ChatConversation = typeof chatConversations.$inferSelect;
export type ChatParticipant = typeof chatParticipants.$inferSelect;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type NotificationPreference = typeof notificationPreferences.$inferSelect;
export type Review = typeof reviews.$inferSelect;