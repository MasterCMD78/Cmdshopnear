import { Router, type IRouter } from "express";
import { and, count, desc, eq, ilike, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@workspace/db";
import {
  businesses,
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
const productInput = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  imagePaths,
  priceCents: z.number().int().min(0).max(100_000_000),
  isAvailable: z.boolean().optional(),
  isVisible: z.boolean().optional(),
});
const serviceInput = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  imagePaths,
  priceFromCents: z.number().int().min(0).max(100_000_000).nullable().optional(),
  serviceRadius: z.number().int().min(0).max(1000).nullable().optional(),
  availability: z.record(z.string(), z.unknown()).nullable().optional(),
  isAvailable: z.boolean().optional(),
  isVisible: z.boolean().optional(),
});

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
    db.select().from(productCategories).orderBy(productCategories.name),
    db.select().from(serviceCategories).orderBy(serviceCategories.name),
  ]);
  res.json({
    products: productsList,
    services: servicesList,
  });
});

router.get("/marketplace/catalog", async (req, res) => {
  const query = typeof req.query.query === "string" ? req.query.query.trim() : "";
  const search = query ? or(ilike(products.name, `%${query}%`), ilike(products.description, `%${query}%`)) : undefined;
  const [productRows, serviceRows] = await Promise.all([
    db.select().from(products).where(and(eq(products.isVisible, true), eq(products.isAvailable, true), search)).orderBy(desc(products.createdAt)).limit(50),
    db.select().from(services).where(and(eq(services.isVisible, true), eq(services.isAvailable, true), query ? or(ilike(services.name, `%${query}%`), ilike(services.description, `%${query}%`)) : undefined)).orderBy(desc(services.createdAt)).limit(50),
  ]);
  res.json({ products: productRows, services: serviceRows });
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
      ])
    : [[{ value: 0 }], [{ value: 0 }], [{ value: 0 }], [{ value: 0 }]];
  const [productCount, availableProducts, serviceCount, visibleProducts] = counts;
  res.json({
    business,
    metrics: {
      products: Number(productCount[0]?.value ?? 0),
      availableProducts: Number(availableProducts[0]?.value ?? 0),
      services: Number(serviceCount[0]?.value ?? 0),
      visibleProducts: Number(visibleProducts[0]?.value ?? 0),
    },
  });
});

router.get("/business/products", requireAuth, requireRole("business", "admin"), async (req, res) => {
  const business = await ownedBusiness(req.user!.id);
  if (!business) {
    res.status(404).json({ error: "Business not registered" });
    return;
  }
  res.json(await db.select().from(products).where(eq(products.businessId, business.id)).orderBy(desc(products.updatedAt)));
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
  res.json(await db.select().from(services).where(ownerFilter).orderBy(desc(services.updatedAt)));
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