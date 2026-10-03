import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./auth";

export const aiPreferences = pgTable("ai_preferences", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  recommendationsEnabled: boolean("recommendations_enabled").notNull().default(true),
  personalizedRecommendations: boolean("personalized_recommendations").notNull().default(false),
  saveSearchHistory: boolean("save_search_history").notNull().default(true),
  preferredCategories: jsonb("preferred_categories").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const aiSearchHistory = pgTable("ai_search_history", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  conversationId: uuid("conversation_id").notNull(),
  question: text("question").notNull(),
  response: jsonb("response").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userCreatedIdx: index("ai_search_history_user_created_idx").on(table.userId, table.createdAt),
  conversationIdx: index("ai_search_history_conversation_idx").on(table.userId, table.conversationId, table.createdAt),
}));

export type AIPreferences = typeof aiPreferences.$inferSelect;
export type AISearchHistory = typeof aiSearchHistory.$inferSelect;