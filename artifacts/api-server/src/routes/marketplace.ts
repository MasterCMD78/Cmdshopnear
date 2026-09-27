import { Router, type IRouter, type Request } from "express";
import { and, count, desc, eq, gte, ilike, or, asc, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@workspace/db";
import {
  businesses,
  favorites,
  productCategories,
  products,
  serviceCategories,
  serviceProviders,
  services,
} from "@workspace/db/schema";
import { audit } from "../lib/audit";
import { requireAuth, requireRole } from "../lib/auth";

const router: IRouter = Router();
const imagePaths = z.array(z.string().max(500)).max(10).optional();
const listingStatus = z.enum(["draft", "published", "hidden", "scheduled", "out_of_stock"]);
const tags = z.array(z.string().trim().min(1).max(40)).max(30).optional();
const jsonObject = z.record(z.string(), z.unknown()).nullable().optional();
const productInput = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  imagePaths,
  primaryImagePath: z.string().max(500).nullable().optional(),
  priceCents: z.number().int().min(0).max(100_000_000),
  regularPriceCents: z.number().int().min(0).max(100_000_000).nullable().optional(),
  discountPriceCents: z.number().int().min(0).max(100_000_000).nullable().optional(),
  brand: z.string().trim().max(120).nullable().optional(),
  condition: z.string().trim().max(80).nullable().optional(),
  specifications: jsonObject,
  location: z.string().trim().max(250).nullable().optional(),
  tags,
  isAvailable: z.boolean().optional(),
  isVisible: z.boolean().optional(),
  status: listingStatus.optional(),
  isFeatured: z.boolean().optional(),
  scheduledAt: z.coerce.date().nullable().optional(),
});
const serviceInput = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  imagePaths,
  primaryImagePath: z.string().max(500).nullable().optional(),
  priceFromCents: z.number().int().min(0).max(100_000_000).nullable().optional(),
  pricingOptions: z.array(jsonObject.unwrap()).max(20).nullable().optional(),
  serviceRadius: z.number().int().min(0).max(1000).nullable().optional(),
  availability: jsonObject,
  workingHours: jsonObject,
  emergencyService: z.boolean().optional(),
  bookingReady: z.boolean().optional(),
  estimatedDuration: z.number().int().min(0).max(10080).nullable().optional(),
  location: z.string().trim().max(250).nullable().optional(),
  tags,
  isAvailable: z.boolean().optional(),
  isVisible: z.boolean().optional(),
  status: listingStatus.optional(),
  isFeatured: z.boolean().optional(),
  scheduledAt: z.coerce.date().nullable().optional(),
});

const categoryInput = z.object({
  type: z.enum(["products", "services"]),
  name: z.string().trim().min(2).max(100),
  slug: z.string().trim().min(2).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  sortOrder: z.number().int().min(0).max(100_000).optional(),
  isVisible: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
});

function categoryTable(type: "products" | "services") {
  return type === "products" ? productCategories : serviceCategories;
}

function normalizeListing<T extends { imagePaths: unknown; tags: unknown }>(listing: T) {
  return {
    ...listing,
    imagePaths: Array.isArray(listing.imagePaths) ? listing.imagePaths : [],
    tags: Array.isArray(listing.tags) ? listing.tags : [],
  };
}

const favoriteInput = z.object({
  targetType: z.enum(["business", "product", "service"]),
  targetId: z.string().uuid(),
});

function publicProductWhere(id: string) {
  return and(
    eq(products.id, id),
    eq(products.status, "published"),
    eq(products.isVisible, true),
    eq(products.isAvailable, true),
  );
}

function publicServiceWhere(id: string) {
  return and(
    eq(services.id, id),
    eq(services.status, "published"),
    eq(services.isVisible, true),
    eq(services.isAvailable, true),
  );
}

async function publicBusiness(id: string) {
  const [business] = await db.select().from(businesses).where(and(eq(businesses.id, id), eq(businesses.verificationStatus, "approved"))).limit(1);
  return business;
}

async function favoriteTarget(targetType: "business" | "product" | "service", targetId: string) {
  if (targetType === "business") {
    const business = await publicBusiness(targetId);
    return business ? { business } : null;
  }
  if (targetType === "product") {
    const [product] = await db.select().from(products).where(publicProductWhere(targetId)).limit(1);
    if (!product) return null;
    const business = await publicBusiness(product.businessId);
    return business ? { product, business } : null;
  }
  const [service] = await db.select().from(services).where(publicServiceWhere(targetId)).limit(1);
  if (!service) return null;
  const business = service.businessId ? await publicBusiness(service.businessId) : null;
  const provider = service.providerId
    ? (await db.select().from(serviceProviders).where(and(eq(serviceProviders.id, service.providerId), eq(serviceProviders.verificationStatus, "approved"))).limit(1))[0]
    : null;
  return business || provider ? { service, business, provider } : null;
}

function parsePagination(req: Request) {
  const page = Math.max(1, Number(req.query.page ?? 1) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit ?? 20) || 20));
  return { page, limit, offset: (page - 1) * limit };
}

async function ownedBusiness(userId: string) {
  const [business] = await db.select().from(businesses).where(eq(businesses.ownerId, userId)).limit(1);
  return business;
}

async function ownedProvider(userId: string) {
  const [provider] = await db.select().from(serviceProviders).where(eq(serviceProviders.ownerId, userId)).limit(1);
  return provider;
}

router.get("/marketplace/categories", async (_req, res) => {
  const [productsList, servicesList] = await Promise.all([
    db.select().from(productCategories).where(eq(productCategories.isVisible, true)).orderBy(asc(productCategories.sortOrder), asc(productCategories.name)),
    db.select().from(serviceCategories).where(eq(serviceCategories.isVisible, true)).orderBy(asc(serviceCategories.sortOrder), asc(serviceCategories.name)),
  ]);
  res.json({
    products: productsList,
    services: servicesList,
  });
});

router.get("/marketplace/catalog", async (req, res) => {
  const query = typeof req.query.query === "string" ? req.query.query.trim() : "";
  const categoryId = typeof req.query.categoryId === "string" ? req.query.categoryId : undefined;
  const featured = req.query.featured === "true";
  const newest = req.query.newest === "true";
  const location = typeof req.query.location === "string" ? req.query.location.trim() : "";
  const tag = typeof req.query.tag === "string" ? req.query.tag.trim() : "";
  const { page, limit, offset } = parsePagination(req);
  const search = query ? or(ilike(products.name, `%${query}%`), ilike(products.description, `%${query}%`), ilike(products.brand, `%${query}%`)) : undefined;
  const serviceSearch = query ? or(ilike(services.name, `%${query}%`), ilike(services.description, `%${query}%`), ilike(services.location, `%${query}%`)) : undefined;
  const productFilters = and(
    eq(products.isVisible, true),
    eq(products.isAvailable, true),
    eq(products.status, "published"),
    categoryId ? eq(products.categoryId, categoryId) : undefined,
    featured ? eq(products.isFeatured, true) : undefined,
    location ? ilike(products.location, `%${location}%`) : undefined,
    tag ? sql`${products.tags}::text ILIKE ${`%${tag}%`}` : undefined,
    search,
  );
  const serviceFilters = and(
    eq(services.isVisible, true),
    eq(services.isAvailable, true),
    eq(services.status, "published"),
    categoryId ? eq(services.categoryId, categoryId) : undefined,
    featured ? eq(services.isFeatured, true) : undefined,
    location ? ilike(services.location, `%${location}%`) : undefined,
    tag ? sql`${services.tags}::text ILIKE ${`%${tag}%`}` : undefined,
    serviceSearch,
  );
  const [productRows, serviceRows] = await Promise.all([
    db.select().from(products).where(productFilters).orderBy(newest ? desc(products.createdAt) : desc(products.favoriteCount), desc(products.createdAt)).limit(limit).offset(offset),
    db.select().from(services).where(serviceFilters).orderBy(newest ? desc(services.createdAt) : desc(services.favoriteCount), desc(services.createdAt)).limit(limit).offset(offset),
  ]);
  res.json({ products: productRows.map(normalizeListing), services: serviceRows.map(normalizeListing), page, limit });
});

router.get("/marketplace/featured", async (_req, res) => {
  const [featuredProducts, featuredServices, newestProducts, newestServices] = await Promise.all([
    db.select().from(products).where(and(eq(products.isFeatured, true), eq(products.status, "published"), eq(products.isVisible, true), eq(products.isAvailable, true))).orderBy(desc(products.updatedAt)).limit(12),
    db.select().from(services).where(and(eq(services.isFeatured, true), eq(services.status, "published"), eq(services.isVisible, true), eq(services.isAvailable, true))).orderBy(desc(services.updatedAt)).limit(12),
    db.select().from(products).where(and(eq(products.status, "published"), eq(products.isVisible, true), eq(products.isAvailable, true))).orderBy(desc(products.createdAt)).limit(12),
    db.select().from(services).where(and(eq(services.status, "published"), eq(services.isVisible, true), eq(services.isAvailable, true))).orderBy(desc(services.createdAt)).limit(12),
  ]);
  const [newBusinesses, newProviders] = await Promise.all([
    db.select().from(businesses).where(eq(businesses.verificationStatus, "approved")).orderBy(desc(businesses.createdAt)).limit(12),
    db.select().from(serviceProviders).where(eq(serviceProviders.verificationStatus, "approved")).orderBy(desc(serviceProviders.createdAt)).limit(12),
  ]);
  res.json({
    featuredBusinesses: newBusinesses.slice(0, 6),
    featuredProducts: featuredProducts.map(normalizeListing),
    featuredServices: featuredServices.map(normalizeListing),
    trendingProducts: newestProducts.map(normalizeListing),
    trendingServices: newestServices.map(normalizeListing),
    newestBusinesses: newBusinesses,
    newestProviders: newProviders,
    newestProducts: newestProducts.map(normalizeListing),
    newestServices: newestServices.map(normalizeListing),
  });
});

router.get("/marketplace/search", async (req, res) => {
  const query = typeof req.query.query === "string" ? req.query.query.trim() : "";
  const verified = req.query.verified === "true";
  const { page, limit, offset } = parsePagination(req);
  const businessWhere = and(
    query ? or(ilike(businesses.businessName, `%${query}%`), ilike(businesses.category, `%${query}%`), ilike(businesses.description, `%${query}%`)) : undefined,
    verified ? eq(businesses.verificationStatus, "approved") : undefined,
  );
  const providerWhere = and(
    query ? or(ilike(serviceProviders.profession, `%${query}%`), ilike(serviceProviders.location, `%${query}%`)) : undefined,
    verified ? eq(serviceProviders.verificationStatus, "approved") : undefined,
  );
  const [businessRows, providerRows, catalog] = await Promise.all([
    db.select().from(businesses).where(businessWhere).orderBy(desc(businesses.createdAt)).limit(limit).offset(offset),
    db.select().from(serviceProviders).where(providerWhere).orderBy(desc(serviceProviders.createdAt)).limit(limit).offset(offset),
    Promise.all([
      db.select().from(products).where(and(eq(products.status, "published"), eq(products.isVisible, true), eq(products.isAvailable, true), query ? or(ilike(products.name, `%${query}%`), ilike(products.description, `%${query}%`), ilike(products.brand, `%${query}%`)) : undefined)).orderBy(desc(products.createdAt)).limit(limit).offset(offset),
      db.select().from(services).where(and(eq(services.status, "published"), eq(services.isVisible, true), eq(services.isAvailable, true), query ? or(ilike(services.name, `%${query}%`), ilike(services.description, `%${query}%`)) : undefined)).orderBy(desc(services.createdAt)).limit(limit).offset(offset),
    ]),
  ]);
  res.json({
    businesses: businessRows,
    serviceProviders: providerRows,
    products: catalog[0].map(normalizeListing),
    services: catalog[1].map(normalizeListing),
    page,
    limit,
  });
});

router.get("/businesses/:id", async (req, res) => {
  const business = await publicBusiness(String(req.params.id));
  if (!business) {
    res.status(404).json({ error: "Business not found" });
    return;
  }
  const [businessProducts, businessServices, relatedBusinesses] = await Promise.all([
    db.select().from(products).where(and(eq(products.businessId, business.id), eq(products.status, "published"), eq(products.isVisible, true), eq(products.isAvailable, true))).orderBy(desc(products.createdAt)).limit(12),
    db.select().from(services).where(and(eq(services.businessId, business.id), eq(services.status, "published"), eq(services.isVisible, true), eq(services.isAvailable, true))).orderBy(desc(services.createdAt)).limit(12),
    db.select().from(businesses).where(and(eq(businesses.category, business.category), eq(businesses.verificationStatus, "approved"))).orderBy(desc(businesses.createdAt)).limit(7),
  ]);
  res.json({
    business,
    products: businessProducts.map(normalizeListing),
    services: businessServices.map(normalizeListing),
    relatedBusinesses: relatedBusinesses.filter((item) => item.id !== business.id).slice(0, 6),
  });
});

router.get("/products/:id", async (req, res) => {
  const [product] = await db.select().from(products).where(publicProductWhere(String(req.params.id))).limit(1);
  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }
  const business = await publicBusiness(product.businessId);
  if (!business) {
    res.status(404).json({ error: "Product not found" });
    return;
  }
  await db.update(products).set({ viewCount: sql`${products.viewCount} + 1` }).where(eq(products.id, product.id));
  const related = await db.select().from(products).where(and(
    eq(products.businessId, product.businessId),
    eq(products.status, "published"),
    eq(products.isVisible, true),
    eq(products.isAvailable, true),
    sql`${products.id} <> ${product.id}`,
  )).orderBy(desc(products.createdAt)).limit(6);
  const servicesList = await db.select().from(services).where(and(
    eq(services.businessId, product.businessId),
    eq(services.status, "published"),
    eq(services.isVisible, true),
    eq(services.isAvailable, true),
  )).orderBy(desc(services.createdAt)).limit(6);
  res.json({
    product: normalizeListing(product),
    business,
    relatedProducts: related.map(normalizeListing),
    relatedServices: servicesList.map(normalizeListing),
  });
});

router.get("/services/:id", async (req, res) => {
  const [service] = await db.select().from(services).where(publicServiceWhere(String(req.params.id))).limit(1);
  if (!service) {
    res.status(404).json({ error: "Service not found" });
    return;
  }
  const business = service.businessId ? await publicBusiness(service.businessId) : null;
  const provider = service.providerId
    ? (await db.select().from(serviceProviders).where(and(eq(serviceProviders.id, service.providerId), eq(serviceProviders.verificationStatus, "approved"))).limit(1))[0]
    : null;
  if (!business && !provider) {
    res.status(404).json({ error: "Service not found" });
    return;
  }
  await db.update(services).set({ viewCount: sql`${services.viewCount} + 1` }).where(eq(services.id, service.id));
  const relatedServices = await db.select().from(services).where(and(
    service.categoryId ? eq(services.categoryId, service.categoryId) : eq(services.businessId, service.businessId ?? ""),
    eq(services.status, "published"),
    eq(services.isVisible, true),
    eq(services.isAvailable, true),
    sql`${services.id} <> ${service.id}`,
  )).orderBy(desc(services.createdAt)).limit(6);
  res.json({
    service: normalizeListing(service),
    business,
    provider,
    relatedServices: relatedServices.map(normalizeListing),
  });
});

router.get("/favorites", requireAuth, async (req, res) => {
  const rows = await db.select().from(favorites).where(eq(favorites.userId, req.user!.id)).orderBy(desc(favorites.createdAt));
  const items = await Promise.all(rows.map(async (favorite) => {
    if (favorite.entityType === "business") {
      const [business] = await db.select().from(businesses).where(eq(businesses.id, favorite.entityId)).limit(1);
      return business ? { id: favorite.id, targetType: "business" as const, targetId: business.id, createdAt: favorite.createdAt, item: business } : null;
    }
    if (favorite.entityType === "product") {
      const [product] = await db.select().from(products).where(eq(products.id, favorite.entityId)).limit(1);
      return product ? { id: favorite.id, targetType: "product" as const, targetId: product.id, createdAt: favorite.createdAt, item: normalizeListing(product) } : null;
    }
    if (favorite.entityType === "service") {
      const [service] = await db.select().from(services).where(eq(services.id, favorite.entityId)).limit(1);
      return service ? { id: favorite.id, targetType: "service" as const, targetId: service.id, createdAt: favorite.createdAt, item: normalizeListing(service) } : null;
    }
    return null;
  }));
  res.json({ favorites: items.filter(Boolean) });
});

router.post("/favorites", requireAuth, async (req, res) => {
  const parsed = favoriteInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid favorite target" });
    return;
  }
  const { targetType, targetId } = parsed.data;
  const target = await favoriteTarget(targetType, targetId);
  if (!target) {
    res.status(404).json({ error: "Listing not found" });
    return;
  }
  const values = {
    userId: req.user!.id,
    entityType: targetType,
    entityId: targetId,
  };
  const [favorite] = await db.insert(favorites).values(values).onConflictDoNothing().returning();
  if (favorite && targetType === "product") {
    await db.update(products).set({ favoriteCount: sql`${products.favoriteCount} + 1` }).where(eq(products.id, targetId));
  }
  if (favorite && targetType === "service") {
    await db.update(services).set({ favoriteCount: sql`${services.favoriteCount} + 1` }).where(eq(services.id, targetId));
  }
  await audit(req, favorite ? "favorite.created" : "favorite.exists", targetType, targetId);
  res.status(favorite ? 201 : 200).json({ favorite: favorite ?? values, targetType, targetId });
});

router.delete("/favorites/:targetType/:targetId", requireAuth, async (req, res) => {
  const targetType = req.params.targetType === "business" || req.params.targetType === "product" || req.params.targetType === "service"
    ? req.params.targetType
    : null;
  const targetId = String(req.params.targetId);
  if (!targetType || !z.string().uuid().safeParse(targetId).success) {
    res.status(400).json({ error: "Invalid favorite target" });
    return;
  }
  const where = and(
    eq(favorites.userId, req.user!.id),
    eq(favorites.entityType, targetType),
    eq(favorites.entityId, targetId),
  );
  const [favorite] = await db.delete(favorites).where(where).returning();
  if (!favorite) {
    res.status(404).json({ error: "Favorite not found" });
    return;
  }
  if (targetType === "product") {
    await db.update(products).set({ favoriteCount: sql`greatest(${products.favoriteCount} - 1, 0)` }).where(eq(products.id, targetId));
  }
  if (targetType === "service") {
    await db.update(services).set({ favoriteCount: sql`greatest(${services.favoriteCount} - 1, 0)` }).where(eq(services.id, targetId));
  }
  await audit(req, "favorite.deleted", targetType, targetId);
  res.json({ message: "Favorite removed" });
});

router.get("/admin/categories", requireAuth, requireRole("admin"), async (req, res) => {
  const type = req.query.type === "services" ? "services" : "products";
  const rows = await db.select().from(categoryTable(type)).orderBy(asc(categoryTable(type).sortOrder), asc(categoryTable(type).name));
  res.json({ type, categories: rows });
});

router.post("/admin/categories", requireAuth, requireRole("admin"), async (req, res) => {
  const parsed = categoryInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid category details" });
    return;
  }
  const { type, ...values } = parsed.data;
  const [category] = await db.insert(categoryTable(type)).values(values).returning();
  await audit(req, "category.created", `${type}_category`, category.id);
  res.status(201).json(category);
});

router.put("/admin/categories/:type/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const type = req.params.type === "services" ? "services" : req.params.type === "products" ? "products" : null;
  if (!type) {
    res.status(400).json({ error: "Category type must be products or services" });
    return;
  }
  const parsed = categoryInput.omit({ type: true }).partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid category details" });
    return;
  }
  const [category] = await db.update(categoryTable(type)).set(parsed.data).where(eq(categoryTable(type).id, String(req.params.id))).returning();
  if (!category) {
    res.status(404).json({ error: "Category not found" });
    return;
  }
  await audit(req, "category.updated", `${type}_category`, category.id);
  res.json(category);
});

router.delete("/admin/categories/:type/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const type = req.params.type === "services" ? "services" : req.params.type === "products" ? "products" : null;
  if (!type) {
    res.status(400).json({ error: "Category type must be products or services" });
    return;
  }
  const [category] = await db.delete(categoryTable(type)).where(eq(categoryTable(type).id, String(req.params.id))).returning();
  if (!category) {
    res.status(404).json({ error: "Category not found" });
    return;
  }
  await audit(req, "category.deleted", `${type}_category`, category.id);
  res.json({ message: "Category deleted" });
});

router.get("/business/dashboard", requireAuth, requireRole("business", "admin"), async (req, res) => {
  const business = await ownedBusiness(req.user!.id);
  if (!business && req.user!.accountType !== "admin") {
    res.status(404).json({ error: "Business not registered" });
    return;
  }
  const businessId = business?.id;
  const counts = businessId
    ? await Promise.all([
        db.select({ value: count() }).from(products).where(eq(products.businessId, businessId)),
        db.select({ value: count() }).from(products).where(and(eq(products.businessId, businessId), eq(products.isAvailable, true))),
        db.select({ value: count() }).from(services).where(eq(services.businessId, businessId)),
        db.select({ value: count() }).from(products).where(and(eq(products.businessId, businessId), eq(products.isVisible, true))),
        db.select({ value: count() }).from(products).where(and(eq(products.businessId, businessId), eq(products.isFeatured, true))),
      ])
    : [[{ value: 0 }], [{ value: 0 }], [{ value: 0 }], [{ value: 0 }], [{ value: 0 }]];
  const [productCount, availableProducts, serviceCount, visibleProducts, featuredProducts] = counts;
  const totals = businessId
    ? await Promise.all([
        db.select({ value: sql<number>`coalesce(sum(${products.viewCount}), 0)` }).from(products).where(eq(products.businessId, businessId)),
        db.select({ value: sql<number>`coalesce(sum(${products.favoriteCount}), 0)` }).from(products).where(eq(products.businessId, businessId)),
      ])
    : [[{ value: 0 }], [{ value: 0 }]];
  res.json({
    business,
    metrics: {
      products: Number(productCount[0]?.value ?? 0),
      availableProducts: Number(availableProducts[0]?.value ?? 0),
      services: Number(serviceCount[0]?.value ?? 0),
      visibleProducts: Number(visibleProducts[0]?.value ?? 0),
      featuredProducts: Number(featuredProducts[0]?.value ?? 0),
      views: Number(totals[0][0]?.value ?? 0),
      favorites: Number(totals[1][0]?.value ?? 0),
      messages: 0,
      verificationStatus: business?.verificationStatus ?? "not_registered",
      visibility: business ? "visible" : "hidden",
      recentActivity: [],
      quickActions: ["add_product", "add_service", "edit_business"],
      sales: { status: "placeholder", value: 0 },
      analytics: { status: "placeholder", value: 0 },
    },
  });
});

router.get("/business/products", requireAuth, requireRole("business", "admin"), async (req, res) => {
  const business = await ownedBusiness(req.user!.id);
  if (!business) {
    res.status(404).json({ error: "Business not registered" });
    return;
  }
  const rows = await db.select().from(products).where(eq(products.businessId, business.id)).orderBy(desc(products.updatedAt));
  res.json(rows.map(normalizeListing));
});

router.post("/business/products", requireAuth, requireRole("business"), async (req, res) => {
  const parsed = productInput.safeParse(req.body);
  const business = await ownedBusiness(req.user!.id);
  if (!business) {
    res.status(404).json({ error: "Business not registered" });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid product details" });
    return;
  }
  const [product] = await db.insert(products).values({
    ...parsed.data,
    ownerId: req.user!.id,
    businessId: business.id,
    status: "published",
    imagePaths: parsed.data.imagePaths ?? [],
  }).returning();
  await audit(req, "product.created", "product", product.id);
  res.status(201).json(product);
});

router.put("/business/products/:id", requireAuth, requireRole("business", "admin"), async (req, res) => {
  const parsed = productInput.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid product details" });
    return;
  }
  const where = req.user!.accountType === "admin"
    ? eq(products.id, String(req.params.id))
    : and(eq(products.id, String(req.params.id)), eq(products.ownerId, req.user!.id));
  const [product] = await db.update(products).set({ ...parsed.data, updatedAt: new Date() }).where(where).returning();
  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }
  await audit(req, "product.updated", "product", product.id);
  res.json(product);
});

router.delete("/business/products/:id", requireAuth, requireRole("business", "admin"), async (req, res) => {
  const where = req.user!.accountType === "admin"
    ? eq(products.id, String(req.params.id))
    : and(eq(products.id, String(req.params.id)), eq(products.ownerId, req.user!.id));
  const [product] = await db.delete(products).where(where).returning();
  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }
  await audit(req, "product.deleted", "product", product.id);
  res.json({ message: "Product deleted" });
});

router.get("/provider/services", requireAuth, requireRole("service_provider", "business", "admin"), async (req, res) => {
  const provider = await ownedProvider(req.user!.id);
  const business = await ownedBusiness(req.user!.id);
  const ownerFilter = provider ? eq(services.providerId, provider.id) : business ? eq(services.businessId, business.id) : eq(services.ownerId, req.user!.id);
  const rows = await db.select().from(services).where(ownerFilter).orderBy(desc(services.updatedAt));
  res.json(rows.map(normalizeListing));
});

router.post("/provider/services", requireAuth, requireRole("service_provider", "business"), async (req, res) => {
  const parsed = serviceInput.safeParse(req.body);
  const provider = req.user!.accountType === "service_provider" ? await ownedProvider(req.user!.id) : null;
  const business = req.user!.accountType === "business" ? await ownedBusiness(req.user!.id) : null;
  if (!provider && !business) {
    res.status(404).json({ error: "Profile not registered" });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid service details" });
    return;
  }
  const [service] = await db.insert(services).values({
    ...parsed.data,
    ownerId: req.user!.id,
    businessId: business?.id ?? null,
    providerId: provider?.id ?? null,
    status: "published",
  }).returning();
  await audit(req, "service.created", "service", service.id);
  res.status(201).json(service);
});

router.put("/provider/services/:id", requireAuth, requireRole("service_provider", "business", "admin"), async (req, res) => {
  const parsed = serviceInput.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid service details" });
    return;
  }
  const where = req.user!.accountType === "admin"
    ? eq(services.id, String(req.params.id))
    : and(eq(services.id, String(req.params.id)), eq(services.ownerId, req.user!.id));
  const [service] = await db.update(services).set({ ...parsed.data, updatedAt: new Date() }).where(where).returning();
  if (!service) {
    res.status(404).json({ error: "Service not found" });
    return;
  }
  await audit(req, "service.updated", "service", service.id);
  res.json(service);
});

router.delete("/provider/services/:id", requireAuth, requireRole("service_provider", "business", "admin"), async (req, res) => {
  const where = req.user!.accountType === "admin"
    ? eq(services.id, String(req.params.id))
    : and(eq(services.id, String(req.params.id)), eq(services.ownerId, req.user!.id));
  const [service] = await db.delete(services).where(where).returning();
  if (!service) {
    res.status(404).json({ error: "Service not found" });
    return;
  }
  await audit(req, "service.deleted", "service", service.id);
  res.json({ message: "Service deleted" });
});

export default router;