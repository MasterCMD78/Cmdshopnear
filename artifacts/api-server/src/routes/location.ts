import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { businesses, serviceProviders, users } from "@workspace/db/schema";
import { audit } from "../lib/audit";
import { requireAuth, requireRole } from "../lib/auth";
import { locationFields, locationUpdateSchema, serializeLocation } from "../lib/location";

const router: IRouter = Router();

router.get("/location", requireAuth, (req, res) => {
  res.json(serializeLocation(req.user!));
});

router.put("/location", requireAuth, async (req, res) => {
  const parsed = locationUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid location details", details: parsed.error.flatten() });
    return;
  }
  const [user] = await db.update(users).set({
    ...locationFields(parsed.data),
    updatedAt: new Date(),
  }).where(eq(users.id, req.user!.id)).returning();
  await audit(req, "location.updated", "user", user.id);
  res.json(serializeLocation(user));
});

router.put("/businesses/:id/location", requireAuth, requireRole("business", "admin"), async (req, res) => {
  const parsed = locationUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid business location details", details: parsed.error.flatten() });
    return;
  }
  const { permissionStatus: _permissionStatus, city: _city, state: _state, ...businessLocation } = parsed.data;
  const conditions = req.user!.accountType === "admin"
    ? eq(businesses.id, String(req.params.id))
    : and(eq(businesses.id, String(req.params.id)), eq(businesses.ownerId, req.user!.id));
  const [business] = await db.update(businesses).set({
    ...locationFields(businessLocation),
    updatedAt: new Date(),
  }).where(conditions).returning();
  if (!business) {
    res.status(404).json({ error: "Business not found" });
    return;
  }
  await audit(req, "location.updated", "business", business.id);
  res.json(serializeLocation(business));
});

router.put("/service-providers/:id/location", requireAuth, requireRole("service_provider", "admin"), async (req, res) => {
  const parsed = locationUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid service provider location details", details: parsed.error.flatten() });
    return;
  }
  const { permissionStatus: _permissionStatus, city: _city, state: _state, ...providerLocation } = parsed.data;
  const conditions = req.user!.accountType === "admin"
    ? eq(serviceProviders.id, String(req.params.id))
    : and(eq(serviceProviders.id, String(req.params.id)), eq(serviceProviders.ownerId, req.user!.id));
  const [provider] = await db.update(serviceProviders).set({
    ...locationFields(providerLocation),
    updatedAt: new Date(),
  }).where(conditions).returning();
  if (!provider) {
    res.status(404).json({ error: "Service provider not found" });
    return;
  }
  await audit(req, "location.updated", "service_provider", provider.id);
  res.json(serializeLocation(provider));
});

export default router;