import { Router, type IRouter } from "express";
import { and, desc, eq, gte, isNotNull, or } from "drizzle-orm";
import {
  CreateBusinessBody,
  CreateBusinessResponse,
  CreateServiceProviderBody,
  CreateServiceProviderResponse,
  GetNewOnShopNearResponse,
  GetNewOnShopNearSettingsResponse,
  GetProfileResponse,
  UpdateBusinessBody,
  UpdateBusinessResponse,
  UpdateNewOnShopNearSettingsBody,
  UpdateNewOnShopNearSettingsResponse,
  UpdateProfileBody,
  UpdateProfileResponse,
  UpdateServiceProviderBody,
  UpdateServiceProviderResponse,
} from "@workspace/api-zod";
import { db } from "@workspace/db";
import { appSettings, businesses, serviceProviders, users, type ServiceProvider } from "@workspace/db/schema";
import { audit } from "../lib/audit";
import { requireAuth, requireRole, serializeUser } from "../lib/auth";

const router: IRouter = Router();

function serializeServiceProvider(provider: ServiceProvider) {
  return {
    ...provider,
    skills: provider.skills ?? [],
    portfolioImages: provider.portfolioImages ?? [],
  };
}

router.get("/profile", requireAuth, (req, res) => {
  res.json(GetProfileResponse.parse(serializeUser(req.user!)));
});

router.put("/profile", requireAuth, async (req, res) => {
  const parsed = UpdateProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid profile details" });
    return;
  }
  const data = parsed.data;
  const [user] = await db.update(users).set({
    ...(data.fullName === undefined ? {} : { fullName: data.fullName.trim() }),
    ...(data.profilePhoto === undefined ? {} : { profilePhoto: data.profilePhoto }),
    ...(data.city === undefined ? {} : { city: data.city }),
    ...(data.state === undefined ? {} : { state: data.state }),
    ...(data.address === undefined ? {} : { address: data.address }),
    ...(data.latitude === undefined ? {} : { latitude: data.latitude === null ? null : String(data.latitude) }),
    ...(data.longitude === undefined ? {} : { longitude: data.longitude === null ? null : String(data.longitude) }),
    ...(data.preferredLanguage === undefined ? {} : { preferredLanguage: data.preferredLanguage ?? "en" }),
    ...(data.notificationsEnabled === undefined ? {} : { notificationsEnabled: data.notificationsEnabled }),
    updatedAt: new Date(),
  }).where(eq(users.id, req.user!.id)).returning();
  await audit(req, "profile.updated", "user", user.id);
  res.json(UpdateProfileResponse.parse(serializeUser(user)));
});

router.post("/businesses", requireAuth, requireRole("business"), async (req, res) => {
  const parsed = CreateBusinessBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid business details" });
    return;
  }
  const [existing] = await db.select().from(businesses).where(eq(businesses.ownerId, req.user!.id)).limit(1);
  if (existing) {
    res.status(409).json({ error: "You already have a business profile" });
    return;
  }
  const [business] = await db.insert(businesses).values({
    ...parsed.data,
    ownerId: req.user!.id,
    latitude: parsed.data.latitude == null ? parsed.data.latitude : String(parsed.data.latitude),
    longitude: parsed.data.longitude == null ? parsed.data.longitude : String(parsed.data.longitude),
  }).returning();
  await audit(req, "business.created", "business", business.id);
  res.status(201).json(CreateBusinessResponse.parse(business));
});

router.get("/businesses/mine", requireAuth, requireRole("business", "admin"), async (req, res) => {
  const [business] = await db.select().from(businesses).where(eq(businesses.ownerId, req.user!.id)).limit(1);
  if (!business) {
    res.status(404).json({ error: "Business not registered" });
    return;
  }
  res.json(CreateBusinessResponse.parse(business));
});

router.put("/businesses/:id", requireAuth, requireRole("business", "admin"), async (req, res) => {
  const parsed = UpdateBusinessBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid business details" });
    return;
  }
  const businessId = String(req.params.id);
  const conditions = req.user!.accountType === "admin"
    ? eq(businesses.id, businessId)
    : and(eq(businesses.id, businessId), eq(businesses.ownerId, req.user!.id));
  const [business] = await db.update(businesses).set({
    ...parsed.data,
    latitude: parsed.data.latitude == null ? parsed.data.latitude : String(parsed.data.latitude),
    longitude: parsed.data.longitude == null ? parsed.data.longitude : String(parsed.data.longitude),
    updatedAt: new Date(),
  }).where(conditions).returning();
  if (!business) {
    res.status(404).json({ error: "Business not found" });
    return;
  }
  await audit(req, "business.updated", "business", business.id);
  res.json(UpdateBusinessResponse.parse(business));
});

router.post("/service-providers", requireAuth, requireRole("service_provider"), async (req, res) => {
  const parsed = CreateServiceProviderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid service provider details" });
    return;
  }
  const [existing] = await db.select().from(serviceProviders).where(eq(serviceProviders.ownerId, req.user!.id)).limit(1);
  if (existing) {
    res.status(409).json({ error: "You already have a service provider profile" });
    return;
  }
  const [provider] = await db.insert(serviceProviders).values({ ...parsed.data, ownerId: req.user!.id }).returning();
  await audit(req, "service_provider.created", "service_provider", provider.id);
  res.status(201).json(CreateServiceProviderResponse.parse(serializeServiceProvider(provider)));
});

router.get("/service-providers/mine", requireAuth, requireRole("service_provider", "admin"), async (req, res) => {
  const [provider] = await db.select().from(serviceProviders).where(eq(serviceProviders.ownerId, req.user!.id)).limit(1);
  if (!provider) {
    res.status(404).json({ error: "Service provider not registered" });
    return;
  }
  res.json(CreateServiceProviderResponse.parse(serializeServiceProvider(provider)));
});

router.put("/service-providers/:id", requireAuth, requireRole("service_provider", "admin"), async (req, res) => {
  const parsed = UpdateServiceProviderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid service provider details" });
    return;
  }
  const providerId = String(req.params.id);
  const conditions = req.user!.accountType === "admin"
    ? eq(serviceProviders.id, providerId)
    : and(eq(serviceProviders.id, providerId), eq(serviceProviders.ownerId, req.user!.id));
  const [provider] = await db.update(serviceProviders).set({ ...parsed.data, updatedAt: new Date() }).where(conditions).returning();
  if (!provider) {
    res.status(404).json({ error: "Service provider not found" });
    return;
  }
  await audit(req, "service_provider.updated", "service_provider", provider.id);
  res.json(UpdateServiceProviderResponse.parse(serializeServiceProvider(provider)));
});

router.get("/new-on-shopnear", async (_req, res) => {
  const [setting] = await db.select().from(appSettings).where(eq(appSettings.key, "new_on_shopnear_days")).limit(1);
  const days = typeof setting?.value === "number" ? setting.value : 30;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const [newBusinesses, newProviders] = await Promise.all([
    db.select().from(businesses).where(and(eq(businesses.verificationStatus, "approved"), isNotNull(businesses.approvedAt), gte(businesses.approvedAt, cutoff))).orderBy(desc(businesses.approvedAt)),
    db.select().from(serviceProviders).where(and(eq(serviceProviders.verificationStatus, "approved"), isNotNull(serviceProviders.approvedAt), gte(serviceProviders.approvedAt, cutoff))).orderBy(desc(serviceProviders.approvedAt)),
  ]);
  res.json(GetNewOnShopNearResponse.parse({
    businesses: newBusinesses,
    serviceProviders: newProviders.map(serializeServiceProvider),
    days,
  }));
});

router.get("/admin/settings/new-on-shopnear", requireAuth, requireRole("admin"), async (_req, res) => {
  const [setting] = await db.select().from(appSettings).where(eq(appSettings.key, "new_on_shopnear_days")).limit(1);
  res.json(GetNewOnShopNearSettingsResponse.parse({ days: typeof setting?.value === "number" ? setting.value : 30 }));
});

router.put("/admin/settings/new-on-shopnear", requireAuth, requireRole("admin"), async (req, res) => {
  const parsed = UpdateNewOnShopNearSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Days must be between 0 and 365" });
    return;
  }
  await db.insert(appSettings).values({ key: "new_on_shopnear_days", value: parsed.data.days, updatedAt: new Date() }).onConflictDoUpdate({
    target: appSettings.key,
    set: { value: parsed.data.days, updatedAt: new Date() },
  });
  await audit(req, "settings.new_on_shopnear.updated", "setting", "new_on_shopnear_days", parsed.data);
  res.json(UpdateNewOnShopNearSettingsResponse.parse(parsed.data));
});

export default router;