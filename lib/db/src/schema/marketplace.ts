import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import { businesses, serviceProviders } from "./accounts";

export const productCategories = pgTable("product_categories", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull().unique(),
  slug: text("slug").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const serviceCategories = pgTable("service_categories", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull().unique(),
  slug: text("slug").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const products = pgTable("products", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
  categoryId: uuid("category_id").references(() => productCategories.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  description: text("description"),
  imagePaths: jsonb("image_paths"),
  priceCents: integer("price_cents").notNull().default(0),
  isAvailable: boolean("is_available").notNull().default(true),
  isVisible: boolean("is_visible").notNull().default(true),
  status: text("status").notNull().default("draft"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const services = pgTable("services", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  businessId: uuid("business_id").references(() => businesses.id, { onDelete: "cascade" }),
  providerId: uuid("provider_id").references(() => serviceProviders.id, { onDelete: "cascade" }),
  categoryId: uuid("category_id").references(() => serviceCategories.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  description: text("description"),
  imagePaths: jsonb("image_paths"),
  priceFromCents: integer("price_from_cents"),
  serviceRadius: integer("service_radius"),
  availability: jsonb("availability"),
  isAvailable: boolean("is_available").notNull().default(true),
  isVisible: boolean("is_visible").notNull().default(true),
  status: text("status").notNull().default("draft"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Product = typeof products.$inferSelect;
export type Service = typeof services.$inferSelect;