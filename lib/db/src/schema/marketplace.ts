import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import { businesses, serviceProviders } from "./accounts";

export const productCategories = pgTable("product_categories", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull().unique(),
  slug: text("slug").notNull().unique(),
  sortOrder: integer("sort_order").notNull().default(0),
  isVisible: boolean("is_visible").notNull().default(true),
  isFeatured: boolean("is_featured").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  visibleOrderIdx: index("product_categories_visible_order_idx").on(table.isVisible, table.sortOrder),
}));

export const serviceCategories = pgTable("service_categories", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull().unique(),
  slug: text("slug").notNull().unique(),
  sortOrder: integer("sort_order").notNull().default(0),
  isVisible: boolean("is_visible").notNull().default(true),
  isFeatured: boolean("is_featured").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  visibleOrderIdx: index("service_categories_visible_order_idx").on(table.isVisible, table.sortOrder),
}));

export const products = pgTable("products", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
  categoryId: uuid("category_id").references(() => productCategories.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  description: text("description"),
  imagePaths: jsonb("image_paths"),
  primaryImagePath: text("primary_image_path"),
  priceCents: integer("price_cents").notNull().default(0),
  regularPriceCents: integer("regular_price_cents"),
  discountPriceCents: integer("discount_price_cents"),
  brand: text("brand"),
  condition: text("condition"),
  specifications: jsonb("specifications"),
  location: text("location"),
  tags: jsonb("tags"),
  isAvailable: boolean("is_available").notNull().default(true),
  isVisible: boolean("is_visible").notNull().default(true),
  status: text("status").notNull().default("draft"),
  isFeatured: boolean("is_featured").notNull().default(false),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  viewCount: integer("view_count").notNull().default(0),
  favoriteCount: integer("favorite_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  catalogIdx: index("products_catalog_idx").on(table.status, table.isVisible, table.isAvailable, table.createdAt),
  categoryIdx: index("products_category_idx").on(table.categoryId),
  ownerIdx: index("products_owner_idx").on(table.ownerId),
}));

export const services = pgTable("services", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  businessId: uuid("business_id").references(() => businesses.id, { onDelete: "cascade" }),
  providerId: uuid("provider_id").references(() => serviceProviders.id, { onDelete: "cascade" }),
  categoryId: uuid("category_id").references(() => serviceCategories.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  description: text("description"),
  imagePaths: jsonb("image_paths"),
  primaryImagePath: text("primary_image_path"),
  priceFromCents: integer("price_from_cents"),
  pricingOptions: jsonb("pricing_options"),
  serviceRadius: integer("service_radius"),
  availability: jsonb("availability"),
  workingHours: jsonb("working_hours"),
  emergencyService: boolean("emergency_service").notNull().default(false),
  bookingReady: boolean("booking_ready").notNull().default(false),
  estimatedDuration: integer("estimated_duration"),
  location: text("location"),
  tags: jsonb("tags"),
  isAvailable: boolean("is_available").notNull().default(true),
  isVisible: boolean("is_visible").notNull().default(true),
  status: text("status").notNull().default("draft"),
  isFeatured: boolean("is_featured").notNull().default(false),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  viewCount: integer("view_count").notNull().default(0),
  favoriteCount: integer("favorite_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  catalogIdx: index("services_catalog_idx").on(table.status, table.isVisible, table.isAvailable, table.createdAt),
  categoryIdx: index("services_category_idx").on(table.categoryId),
  ownerIdx: index("services_owner_idx").on(table.ownerId),
}));

export type Product = typeof products.$inferSelect;
export type Service = typeof services.$inferSelect;