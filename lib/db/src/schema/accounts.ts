import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./auth";

export const businesses = pgTable("businesses", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  businessName: text("business_name").notNull(),
  category: text("category").notNull(),
  businessLogo: text("business_logo"),
  coverPhoto: text("cover_photo"),
  description: text("description"),
  workingHours: jsonb("working_hours"),
  businessAddress: text("business_address"),
  latitude: text("latitude"),
  longitude: text("longitude"),
  whatsapp: text("whatsapp"),
  phone: text("phone"),
  website: text("website"),
  socialLinks: jsonb("social_links"),
  verificationStatus: text("verification_status").notNull().default("pending"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  averageRating: text("average_rating").notNull().default("0"),
  totalReviews: integer("total_reviews").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const serviceProviders = pgTable("service_providers", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  profession: text("profession").notNull(),
  experience: text("experience"),
  skills: jsonb("skills"),
  serviceRadius: integer("service_radius"),
  portfolioImages: jsonb("portfolio_images"),
  availability: jsonb("availability"),
  phone: text("phone"),
  whatsapp: text("whatsapp"),
  location: text("location"),
  verificationStatus: text("verification_status").notNull().default("pending"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Business = typeof businesses.$inferSelect;
export type ServiceProvider = typeof serviceProviders.$inferSelect;