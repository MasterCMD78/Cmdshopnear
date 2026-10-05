import { Router, type IRouter, type Request } from "express";
import {
  and,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import { z } from "zod/v4";
import { db } from "@workspace/db";
import {
  adminRoleAssignments,
  analyticsEvents,
  appSettings,
  auditLogs,
  businesses,
  chatConversations,
  chatMessages,
  contentReports,
  moderationActions,
  products,
  productCategories,
  reviews,
  serviceProviders,
  serviceCategories,
  services,
  sessions,
  users,
  verificationHistory,
  verificationRequests,
} from "@workspace/db/schema";
import { audit } from "../lib/audit";
import { createNotification } from "../lib/engagement";
import { requireAuth, requireRole } from "../lib/auth";
import {
  ADMIN_ROLES,
  getAdminRole,
  permissionsForRole,
  requirePermission,
} from "../lib/admin-permissions";
import { consumeRateLimit } from "../lib/rate-limit";

const router: IRouter = Router();
const uuid = z.string().uuid();
const entityTypeSchema = z.enum(["business", "service_provider"]);
const verificationStatusSchema = z.enum(["pending", "under_review", "approved", "rejected", "suspended"]);
const pageSchema = z.coerce.number().int().min(1).default(1);
const limitSchema = z.coerce.number().int().min(1).max(100).default(25);

function parsePage(query: Record<string, unknown>) {
  return z.object({ page: pageSchema, limit: limitSchema }).safeParse(query);
}

function canWriteAdmin(req: Request) {
  return Boolean(req.user && consumeRateLimit(`admin-write:${req.user.id}`, 180, 60 * 60_000));
}

router.get("/admin/access", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const role = await getAdminRole(req.user!.id);
  res.json({ role, permissions: permissionsForRole(role) });
});

router.post("/admin/roles/bootstrap", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  if (!canWriteAdmin(req)) {
    res.status(429).json({ error: "Administrator action rate limit exceeded" });
    return;
  }
  const [assignment] = await db.transaction(async (tx) => {
    const [existing] = await tx.select({ userId: adminRoleAssignments.userId })
      .from(adminRoleAssignments)
      .where(eq(adminRoleAssignments.role, "super_admin"))
      .limit(1);
    if (existing) return [];
    return tx.insert(adminRoleAssignments).values({
      userId: req.user!.id,
      role: "super_admin",
      assignedById: req.user!.id,
    }).onConflictDoNothing().returning();
  });
  if (!assignment) {
    res.status(409).json({ error: "A super administrator has already been assigned" });
    return;
  }
  await audit(req, "admin.role.bootstrap", "user", req.user!.id, { role: "super_admin" });
  res.status(201).json({ userId: assignment.userId, role: assignment.role, permissions: permissionsForRole(assignment.role) });
});

router.get("/admin/roles", requireAuth, requirePermission("roles.manage"), async (_req, res): Promise<void> => {
  const assignments = await db.select({
    userId: users.id,
    fullName: users.fullName,
    phone: users.phone,
    email: users.email,
    role: adminRoleAssignments.role,
    assignedAt: adminRoleAssignments.createdAt,
  }).from(adminRoleAssignments)
    .innerJoin(users, eq(users.id, adminRoleAssignments.userId))
    .where(and(eq(users.accountType, "admin"), eq(users.status, "active")))
    .orderBy(desc(adminRoleAssignments.createdAt));
  res.json({ administrators: assignments, roles: ADMIN_ROLES });
});

router.put("/admin/roles/:userId", requireAuth, requirePermission("roles.manage"), async (req, res): Promise<void> => {
  const userId = uuid.safeParse(req.params.userId);
  const body = z.object({ role: z.enum(ADMIN_ROLES) }).safeParse(req.body);
  if (!userId.success || !body.success) {
    res.status(400).json({ error: "Invalid administrator role assignment" });
    return;
  }
  if (!canWriteAdmin(req)) {
    res.status(429).json({ error: "Administrator action rate limit exceeded" });
    return;
  }
  if (body.data.role === "super_admin" && await getAdminRole(req.user!.id) !== "super_admin") {
    res.status(403).json({ error: "Only a super administrator can assign that role" });
    return;
  }
  const [target] = await db.select({ id: users.id, accountType: users.accountType, status: users.status })
    .from(users).where(eq(users.id, userId.data)).limit(1);
  if (!target || target.accountType !== "admin" || target.status !== "active") {
    res.status(404).json({ error: "Active administrator account not found" });
    return;
  }
  const [updated] = await db.insert(adminRoleAssignments).values({
    userId: target.id,
    role: body.data.role,
    assignedById: req.user!.id,
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: adminRoleAssignments.userId,
    set: { role: body.data.role, assignedById: req.user!.id, updatedAt: new Date() },
  }).returning();
  if (!updated) {
    res.status(409).json({ error: "That super administrator role is already assigned" });
    return;
  }
  await audit(req, "admin.role.assigned", "user", target.id, { role: updated.role });
  res.json({ userId: updated.userId, role: updated.role, permissions: permissionsForRole(updated.role) });
});

router.delete("/admin/roles/:userId", requireAuth, requirePermission("roles.manage"), async (req, res): Promise<void> => {
  const userId = uuid.safeParse(req.params.userId);
  if (!userId.success) {
    res.status(400).json({ error: "Invalid administrator id" });
    return;
  }
  const [target] = await db.select().from(adminRoleAssignments)
    .where(eq(adminRoleAssignments.userId, userId.data)).limit(1);
  if (!target) {
    res.status(404).json({ error: "Administrator role assignment not found" });
    return;
  }
  if (target.role === "super_admin") {
    res.status(409).json({ error: "The super administrator role must be transferred, not removed" });
    return;
  }
  await db.delete(adminRoleAssignments).where(eq(adminRoleAssignments.userId, userId.data));
  await audit(req, "admin.role.removed", "user", userId.data, { previousRole: target.role });
  res.json({ message: "Administrator role removed" });
});

async function loadVerificationTarget(entityType: "business" | "service_provider", entityId: string) {
  if (entityType === "business") {
    const [row] = await db.select({
      id: businesses.id,
      ownerId: businesses.ownerId,
      entityName: businesses.businessName,
      status: businesses.verificationStatus,
      approvedAt: businesses.approvedAt,
      createdAt: businesses.createdAt,
    }).from(businesses).where(eq(businesses.id, entityId)).limit(1);
    return row ?? null;
  }
  const [row] = await db.select({
    id: serviceProviders.id,
    ownerId: serviceProviders.ownerId,
    entityName: serviceProviders.profession,
    status: serviceProviders.verificationStatus,
    approvedAt: serviceProviders.approvedAt,
    createdAt: serviceProviders.createdAt,
  }).from(serviceProviders).where(eq(serviceProviders.id, entityId)).limit(1);
  return row ?? null;
}

async function saveVerificationStatus(
  entityType: "business" | "service_provider",
  entityId: string,
  status: z.infer<typeof verificationStatusSchema>,
) {
  const now = new Date();
  if (entityType === "business") {
    const [current] = await db.select({ approvedAt: businesses.approvedAt }).from(businesses).where(eq(businesses.id, entityId)).limit(1);
    const [row] = await db.update(businesses).set({
      verificationStatus: status,
      approvedAt: status === "approved" ? now : status === "suspended" ? current?.approvedAt ?? null : null,
      updatedAt: now,
    }).where(eq(businesses.id, entityId)).returning({ id: businesses.id });
    return row ?? null;
  }
  const [current] = await db.select({ approvedAt: serviceProviders.approvedAt }).from(serviceProviders).where(eq(serviceProviders.id, entityId)).limit(1);
  const [row] = await db.update(serviceProviders).set({
    verificationStatus: status,
    approvedAt: status === "approved" ? now : status === "suspended" ? current?.approvedAt ?? null : null,
    updatedAt: now,
  }).where(eq(serviceProviders.id, entityId)).returning({ id: serviceProviders.id });
  return row ?? null;
}

router.post("/verification-requests", requireAuth, async (req, res): Promise<void> => {
  const body = z.object({
    entityType: entityTypeSchema,
    entityId: uuid,
    applicantNote: z.string().trim().max(1000).nullable().optional(),
  }).safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid verification request" });
    return;
  }
  const target = await loadVerificationTarget(body.data.entityType, body.data.entityId);
  if (!target || target.ownerId !== req.user!.id) {
    res.status(404).json({ error: "Verification profile not found" });
    return;
  }
  if (target.status === "approved" || target.status === "suspended" || target.status === "under_review") {
    res.status(409).json({ error: `A verification request cannot be submitted while the profile is ${target.status}` });
    return;
  }
  const [pending] = await db.select({ id: verificationRequests.id }).from(verificationRequests)
    .where(and(
      eq(verificationRequests.entityType, body.data.entityType),
      eq(verificationRequests.entityId, body.data.entityId),
      inArray(verificationRequests.status, ["pending", "under_review"]),
    )).limit(1);
  if (pending) {
    res.status(409).json({ error: "A verification request is already active" });
    return;
  }
  const created = await db.transaction(async (tx) => {
    await tx.update(body.data.entityType === "business" ? businesses : serviceProviders)
      .set({ verificationStatus: "pending", approvedAt: null, updatedAt: new Date() })
      .where(eq(body.data.entityType === "business" ? businesses.id : serviceProviders.id, body.data.entityId));
    const [request] = await tx.insert(verificationRequests).values({
      entityType: body.data.entityType,
      entityId: body.data.entityId,
      ownerId: req.user!.id,
      applicantNote: body.data.applicantNote?.trim() || null,
      status: "pending",
    }).returning();
    await tx.insert(verificationHistory).values({
      requestId: request!.id,
      entityType: body.data.entityType,
      entityId: body.data.entityId,
      previousStatus: target.status,
      newStatus: "pending",
      note: body.data.applicantNote?.trim() || null,
      actorUserId: req.user!.id,
    });
    return request;
  });
  await audit(req, "verification.submitted", body.data.entityType, body.data.entityId, { requestId: created!.id });
  res.status(201).json(created);
});

router.get("/verification-requests/mine", requireAuth, async (req, res): Promise<void> => {
  const rows = await db.select().from(verificationRequests)
    .where(eq(verificationRequests.ownerId, req.user!.id))
    .orderBy(desc(verificationRequests.createdAt))
    .limit(100);
  res.json({ requests: rows });
});

router.get("/admin/verifications", requireAuth, requirePermission("verification.read"), async (req, res): Promise<void> => {
  const query = z.object({
    status: verificationStatusSchema.optional(),
    entityType: entityTypeSchema.optional(),
    page: pageSchema,
    limit: limitSchema,
  }).safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: "Invalid verification queue filters" });
    return;
  }
  const states = query.data.status ? [query.data.status] : ["pending", "under_review"];
  const types = query.data.entityType ? [query.data.entityType] : ["business", "service_provider"];
  const targets = await Promise.all(types.map(async (type) => {
    if (type === "business") {
      return db.select({
        id: businesses.id, ownerId: businesses.ownerId, name: businesses.businessName,
        status: businesses.verificationStatus, createdAt: businesses.createdAt,
        ownerName: users.fullName, ownerPhone: users.phone, ownerEmail: users.email,
      }).from(businesses).innerJoin(users, eq(users.id, businesses.ownerId))
        .where(inArray(businesses.verificationStatus, states));
    }
    return db.select({
      id: serviceProviders.id, ownerId: serviceProviders.ownerId, name: serviceProviders.profession,
      status: serviceProviders.verificationStatus, createdAt: serviceProviders.createdAt,
      ownerName: users.fullName, ownerPhone: users.phone, ownerEmail: users.email,
    }).from(serviceProviders).innerJoin(users, eq(users.id, serviceProviders.ownerId))
      .where(inArray(serviceProviders.verificationStatus, states));
  }));
  const flattened = targets.flatMap((rows, index) => rows.map((row) => ({ ...row, entityType: types[index]! })));
  flattened.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const page = query.data.page;
  const limit = query.data.limit;
  const pageRows = flattened.slice((page - 1) * limit, page * limit);
  const requestRows = pageRows.length ? await db.select().from(verificationRequests)
    .where(or(...pageRows.map((row) => and(
      eq(verificationRequests.entityType, row.entityType),
      eq(verificationRequests.entityId, row.id),
    ))))
    .orderBy(desc(verificationRequests.createdAt)) : [];
  const latestRequests = new Map<string, typeof verificationRequests.$inferSelect>();
  for (const request of requestRows) {
    const key = `${request.entityType}:${request.entityId}`;
    if (!latestRequests.has(key)) latestRequests.set(key, request);
  }
  const entries = pageRows.map((row) => {
    const request = latestRequests.get(`${row.entityType}:${row.id}`);
    return {
      ...row,
      requestId: request?.id ?? null,
      applicantNote: request?.applicantNote ?? null,
      adminNote: request?.adminNote ?? null,
      submittedAt: request?.createdAt ?? row.createdAt,
    };
  });
  res.json({ requests: entries, page, limit, total: flattened.length, hasMore: page * limit < flattened.length });
});

router.patch("/admin/verifications/:entityType/:entityId", requireAuth, requirePermission("verification.review"), async (req, res): Promise<void> => {
  const params = z.object({ entityType: entityTypeSchema, entityId: uuid }).safeParse(req.params);
  const body = z.object({
    status: verificationStatusSchema,
    adminNote: z.string().trim().max(2000).nullable().optional(),
  }).safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid verification decision" });
    return;
  }
  if (!canWriteAdmin(req)) {
    res.status(429).json({ error: "Administrator action rate limit exceeded" });
    return;
  }
  const target = await loadVerificationTarget(params.data.entityType, params.data.entityId);
  if (!target) {
    res.status(404).json({ error: "Verification profile not found" });
    return;
  }
  const result = await db.transaction(async (tx) => {
    const [latest] = await tx.select().from(verificationRequests)
      .where(and(
        eq(verificationRequests.entityType, params.data.entityType),
        eq(verificationRequests.entityId, params.data.entityId),
      )).orderBy(desc(verificationRequests.createdAt)).limit(1);
    const request = latest ?? (await tx.insert(verificationRequests).values({
      entityType: params.data.entityType,
      entityId: params.data.entityId,
      ownerId: target.ownerId,
      status: target.status,
    }).returning())[0];
    await tx.update(verificationRequests).set({
      status: body.data.status,
      adminNote: body.data.adminNote?.trim() || null,
      reviewedById: req.user!.id,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(verificationRequests.id, request!.id));
    const entityTable = params.data.entityType === "business" ? businesses : serviceProviders;
    await tx.update(entityTable).set({
      verificationStatus: body.data.status,
      approvedAt: body.data.status === "approved" ? new Date() : body.data.status === "suspended" ? target.approvedAt : null,
      updatedAt: new Date(),
    }).where(eq(entityTable.id, params.data.entityId));
    await tx.insert(verificationHistory).values({
      requestId: request!.id,
      entityType: params.data.entityType,
      entityId: params.data.entityId,
      previousStatus: target.status,
      newStatus: body.data.status,
      note: body.data.adminNote?.trim() || null,
      actorUserId: req.user!.id,
    });
    return request;
  });
  await audit(req, `verification.${body.data.status}`, params.data.entityType, params.data.entityId, { requestId: result!.id });
  await createNotification(
    target.ownerId,
    "verification",
    `Verification ${body.data.status.replace("_", " ")}`,
    body.data.adminNote?.trim() || `Your ${params.data.entityType === "business" ? "business" : "service provider"} verification status is now ${body.data.status.replace("_", " ")}.`,
    params.data.entityType,
    params.data.entityId,
  );
  res.json({ ...result, status: body.data.status, adminNote: body.data.adminNote?.trim() || null });
});

router.get("/admin/verifications/:entityType/:entityId/history", requireAuth, requirePermission("verification.read"), async (req, res): Promise<void> => {
  const params = z.object({ entityType: entityTypeSchema, entityId: uuid }).safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid verification profile" });
    return;
  }
  const history = await db.select({
    id: verificationHistory.id,
    requestId: verificationHistory.requestId,
    previousStatus: verificationHistory.previousStatus,
    newStatus: verificationHistory.newStatus,
    note: verificationHistory.note,
    actorUserId: verificationHistory.actorUserId,
    actorName: users.fullName,
    createdAt: verificationHistory.createdAt,
  }).from(verificationHistory)
    .leftJoin(users, eq(users.id, verificationHistory.actorUserId))
    .where(and(
      eq(verificationHistory.entityType, params.data.entityType),
      eq(verificationHistory.entityId, params.data.entityId),
    )).orderBy(desc(verificationHistory.createdAt)).limit(100);
  res.json({ history });
});

const thirtyDaysAgo = () => new Date(Date.now() - 30 * 24 * 60 * 60_000);

router.get("/admin/dashboard", requireAuth, requirePermission("dashboard.read"), async (_req, res): Promise<void> => {
  const cutoff = thirtyDaysAgo();
  const [
    [userCount], [businessCount], [providerCount], [productCount], [serviceCount],
    [conversationCount], [reviewCount], [ratingCount], [pendingBusinessCount],
    [pendingProviderCount], [pendingReportCount], recentRegistrations, activityRows,
  ] = await Promise.all([
    db.select({ value: count() }).from(users),
    db.select({ value: count() }).from(businesses),
    db.select({ value: count() }).from(serviceProviders),
    db.select({ value: count() }).from(products),
    db.select({ value: count() }).from(services),
    db.select({ value: count() }).from(chatConversations).where(gte(chatConversations.lastMessageAt, cutoff)),
    db.select({ value: count() }).from(reviews),
    db.select({ value: count() }).from(reviews).where(eq(reviews.moderationStatus, "visible")),
    db.select({ value: count() }).from(businesses).where(inArray(businesses.verificationStatus, ["pending", "under_review"])),
    db.select({ value: count() }).from(serviceProviders).where(inArray(serviceProviders.verificationStatus, ["pending", "under_review"])),
    db.select({ value: count() }).from(contentReports).where(inArray(contentReports.status, ["open", "investigating"])),
    db.select({
      id: users.id, fullName: users.fullName, accountType: users.accountType,
      city: users.city, state: users.state, status: users.status, createdAt: users.createdAt,
    }).from(users).orderBy(desc(users.createdAt)).limit(8),
    db.select({
      id: auditLogs.id, action: auditLogs.action, entityType: auditLogs.entityType,
      entityId: auditLogs.entityId, createdAt: auditLogs.createdAt,
      actorId: users.id, actorName: users.fullName,
    }).from(auditLogs).leftJoin(users, eq(users.id, auditLogs.actorUserId))
      .orderBy(desc(auditLogs.createdAt)).limit(10),
  ]);
  const [ratingAggregate] = await db.select({
    average: sql<number>`coalesce(avg(${reviews.rating}), 0)`,
  }).from(reviews).where(eq(reviews.moderationStatus, "visible"));
  res.json({
    totals: {
      users: Number(userCount?.value ?? 0),
      businesses: Number(businessCount?.value ?? 0),
      serviceProviders: Number(providerCount?.value ?? 0),
      products: Number(productCount?.value ?? 0),
      services: Number(serviceCount?.value ?? 0),
      activeConversations: Number(conversationCount?.value ?? 0),
      reviews: Number(reviewCount?.value ?? 0),
      ratings: Number(ratingCount?.value ?? 0),
      pendingVerifications: Number(pendingBusinessCount?.value ?? 0) + Number(pendingProviderCount?.value ?? 0),
      pendingReports: Number(pendingReportCount?.value ?? 0),
      averageRating: Number(ratingAggregate?.average ?? 0),
    },
    recentRegistrations,
    recentActivity: activityRows,
    windowDays: 30,
  });
});

router.get("/admin/analytics", requireAuth, requirePermission("analytics.read"), async (req, res): Promise<void> => {
  const query = z.object({ days: z.coerce.number().int().min(7).max(90).default(30) }).safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: "Analytics window must be 7 to 90 days" });
    return;
  }
  const cutoff = new Date(Date.now() - query.data.days * 24 * 60 * 60_000);
  const [
    registrationRows,
    businessRows,
    providerRows,
    productRows,
    serviceRows,
    eventRows,
    productCategoryRows,
    serviceCategoryRows,
    ratingRows,
  ] = await Promise.all([
    db.select({
      day: sql<string>`to_char(date_trunc('day', ${users.createdAt}), 'YYYY-MM-DD')`,
      count: count(),
    }).from(users).where(gte(users.createdAt, cutoff)).groupBy(sql`date_trunc('day', ${users.createdAt})`),
    db.select({
      day: sql<string>`to_char(date_trunc('day', ${businesses.createdAt}), 'YYYY-MM-DD')`,
      count: count(),
    }).from(businesses).where(gte(businesses.createdAt, cutoff)).groupBy(sql`date_trunc('day', ${businesses.createdAt})`),
    db.select({
      day: sql<string>`to_char(date_trunc('day', ${serviceProviders.createdAt}), 'YYYY-MM-DD')`,
      count: count(),
    }).from(serviceProviders).where(gte(serviceProviders.createdAt, cutoff)).groupBy(sql`date_trunc('day', ${serviceProviders.createdAt})`),
    db.select({
      day: sql<string>`to_char(date_trunc('day', ${products.createdAt}), 'YYYY-MM-DD')`,
      count: count(),
    }).from(products).where(gte(products.createdAt, cutoff)).groupBy(sql`date_trunc('day', ${products.createdAt})`),
    db.select({
      day: sql<string>`to_char(date_trunc('day', ${services.createdAt}), 'YYYY-MM-DD')`,
      count: count(),
    }).from(services).where(gte(services.createdAt, cutoff)).groupBy(sql`date_trunc('day', ${services.createdAt})`),
    db.select({
      day: sql<string>`to_char(date_trunc('day', ${analyticsEvents.createdAt}), 'YYYY-MM-DD')`,
      eventType: analyticsEvents.eventType,
      count: count(),
      activeUsers: sql<number>`count(distinct ${analyticsEvents.userId})`,
    }).from(analyticsEvents).where(gte(analyticsEvents.createdAt, cutoff))
      .groupBy(sql`date_trunc('day', ${analyticsEvents.createdAt})`, analyticsEvents.eventType),
    db.select({ category: productCategories.name, count: count(products.id) })
      .from(products).leftJoin(productCategories, eq(productCategories.id, products.categoryId))
      .groupBy(productCategories.name).orderBy(desc(count(products.id))).limit(12),
    db.select({ category: serviceCategories.name, count: count(services.id) })
      .from(services).leftJoin(serviceCategories, eq(serviceCategories.id, services.categoryId))
      .groupBy(serviceCategories.name).orderBy(desc(count(services.id))).limit(12),
    db.select({ rating: reviews.rating, count: count() }).from(reviews)
      .where(eq(reviews.moderationStatus, "visible")).groupBy(reviews.rating),
  ]);
  const dayMap = new Map<string, {
    date: string; registrations: number; businesses: number; serviceProviders: number;
    products: number; services: number; dailyActiveUsers: number; searches: number;
    aiSearches: number; chats: number; notifications: number; favorites: number; reviews: number;
  }>();
  const getDay = (date: string) => {
    let item = dayMap.get(date);
    if (!item) {
      item = {
        date, registrations: 0, businesses: 0, serviceProviders: 0, products: 0,
        services: 0, dailyActiveUsers: 0, searches: 0, aiSearches: 0,
        chats: 0, notifications: 0, favorites: 0, reviews: 0,
      };
      dayMap.set(date, item);
    }
    return item;
  };
  for (const row of registrationRows) getDay(row.day).registrations = Number(row.count);
  for (const row of businessRows) getDay(row.day).businesses = Number(row.count);
  for (const row of providerRows) getDay(row.day).serviceProviders = Number(row.count);
  for (const row of productRows) getDay(row.day).products = Number(row.count);
  for (const row of serviceRows) getDay(row.day).services = Number(row.count);
  for (const row of eventRows) {
    const day = getDay(row.day);
    day.dailyActiveUsers = Math.max(day.dailyActiveUsers, Number(row.activeUsers));
    if (row.eventType === "search") day.searches = Number(row.count);
    if (row.eventType === "ai_search") day.aiSearches = Number(row.count);
    if (row.eventType === "chat") day.chats = Number(row.count);
    if (row.eventType === "notification") day.notifications = Number(row.count);
    if (row.eventType === "favorite") day.favorites = Number(row.count);
    if (row.eventType === "review") day.reviews = Number(row.count);
  }
  const days: string[] = [];
  for (let offset = query.data.days - 1; offset >= 0; offset -= 1) {
    const day = new Date(Date.now() - offset * 24 * 60 * 60_000).toISOString().slice(0, 10);
    days.push(day);
    getDay(day);
  }
  res.json({
    days: Array.from(dayMap.values()).sort((a, b) => a.date.localeCompare(b.date)),
    categoryPopularity: [
      ...productCategoryRows.map((row) => ({ category: row.category ?? "Uncategorized", type: "product", count: Number(row.count) })),
      ...serviceCategoryRows.map((row) => ({ category: row.category ?? "Uncategorized", type: "service", count: Number(row.count) })),
    ].sort((a, b) => b.count - a.count).slice(0, 12),
    ratingDistribution: [1, 2, 3, 4, 5].map((rating) => ({
      rating,
      count: Number(ratingRows.find((row) => row.rating === rating)?.count ?? 0),
    })),
    searchTrends: days.map((date) => {
      const value = getDay(date);
      return { date, searches: value.searches, aiSearches: value.aiSearches };
    }),
    windowDays: query.data.days,
    privacy: "Search analytics contain aggregate event counts only; query text and coordinates are not stored.",
  });
});

router.get("/admin/audit-logs", requireAuth, requirePermission("audit.read"), async (req, res): Promise<void> => {
  const parsed = z.object({
    page: pageSchema,
    limit: limitSchema,
    action: z.string().trim().max(100).optional(),
    actorUserId: uuid.optional(),
    entityType: z.string().trim().max(100).optional(),
  }).safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid audit log filters" });
    return;
  }
  const conditions = and(
    parsed.data.action ? ilike(auditLogs.action, `%${parsed.data.action}%`) : undefined,
    parsed.data.actorUserId ? eq(auditLogs.actorUserId, parsed.data.actorUserId) : undefined,
    parsed.data.entityType ? eq(auditLogs.entityType, parsed.data.entityType) : undefined,
  );
  const [[totalRow], rows] = await Promise.all([
    db.select({ total: count() }).from(auditLogs).where(conditions),
    db.select({
      id: auditLogs.id, actorUserId: auditLogs.actorUserId,
      actorName: users.fullName, action: auditLogs.action,
      entityType: auditLogs.entityType, entityId: auditLogs.entityId,
      metadata: auditLogs.metadata, createdAt: auditLogs.createdAt,
    }).from(auditLogs).leftJoin(users, eq(users.id, auditLogs.actorUserId))
      .where(conditions).orderBy(desc(auditLogs.createdAt))
      .limit(parsed.data.limit).offset((parsed.data.page - 1) * parsed.data.limit),
  ]);
  const total = Number(totalRow?.total ?? 0);
  res.json({
    logs: rows,
    page: parsed.data.page,
    limit: parsed.data.limit,
    total,
    hasMore: parsed.data.page * parsed.data.limit < total,
  });
});

router.get("/admin/users", requireAuth, requirePermission("users.read"), async (req, res): Promise<void> => {
  const parsed = z.object({
    page: pageSchema,
    limit: limitSchema,
    query: z.string().trim().max(120).optional(),
    accountType: z.enum(["customer", "business", "service_provider", "admin"]).optional(),
    status: z.enum(["active", "suspended", "deleted"]).optional(),
  }).safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid user filters" });
    return;
  }
  const search = parsed.data.query?.trim();
  const conditions = and(
    parsed.data.accountType ? eq(users.accountType, parsed.data.accountType) : undefined,
    parsed.data.status ? eq(users.status, parsed.data.status) : undefined,
    search ? or(
      ilike(users.fullName, `%${search}%`),
      ilike(users.phone, `%${search}%`),
      ilike(users.email, `%${search}%`),
    ) : undefined,
  );
  const [[totalRow], rows] = await Promise.all([
    db.select({ total: count() }).from(users).where(conditions),
    db.select({
      id: users.id, fullName: users.fullName, phone: users.phone, email: users.email,
      accountType: users.accountType, city: users.city, state: users.state,
      status: users.status, createdAt: users.createdAt,
      adminRole: adminRoleAssignments.role,
    }).from(users).leftJoin(adminRoleAssignments, eq(adminRoleAssignments.userId, users.id))
      .where(conditions).orderBy(desc(users.createdAt))
      .limit(parsed.data.limit).offset((parsed.data.page - 1) * parsed.data.limit),
  ]);
  const total = Number(totalRow?.total ?? 0);
  res.json({ users: rows, page: parsed.data.page, limit: parsed.data.limit, total, hasMore: parsed.data.page * parsed.data.limit < total });
});

router.get("/admin/users/:id", requireAuth, requirePermission("users.read"), async (req, res): Promise<void> => {
  const id = uuid.safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ error: "Invalid user id" });
    return;
  }
  const [row] = await db.select({
    user: {
      id: users.id, fullName: users.fullName, phone: users.phone, email: users.email,
      accountType: users.accountType, profilePhoto: users.profilePhoto, city: users.city,
      state: users.state, preferredLanguage: users.preferredLanguage,
      notificationsEnabled: users.notificationsEnabled, status: users.status,
      phoneVerifiedAt: users.phoneVerifiedAt, createdAt: users.createdAt, updatedAt: users.updatedAt,
    },
    adminRole: adminRoleAssignments.role,
  }).from(users).leftJoin(adminRoleAssignments, eq(adminRoleAssignments.userId, users.id))
    .where(eq(users.id, id.data)).limit(1);
  if (!row) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const [business, provider, submittedReports, accountReviews, auditCount] = await Promise.all([
    db.select({
      id: businesses.id, businessName: businesses.businessName,
      verificationStatus: businesses.verificationStatus,
    }).from(businesses).where(eq(businesses.ownerId, id.data)).limit(1),
    db.select({
      id: serviceProviders.id, profession: serviceProviders.profession,
      verificationStatus: serviceProviders.verificationStatus,
    }).from(serviceProviders).where(eq(serviceProviders.ownerId, id.data)).limit(1),
    db.select({ value: count() }).from(contentReports).where(eq(contentReports.reporterId, id.data)),
    db.select({ value: count() }).from(reviews).where(eq(reviews.userId, id.data)),
    db.select({ value: count() }).from(auditLogs).where(eq(auditLogs.actorUserId, id.data)),
  ]);
  res.json({
    user: row.user,
    adminRole: row.adminRole,
    business: business[0] ?? null,
    serviceProvider: provider[0] ?? null,
    activitySummary: {
      reportsSubmitted: Number(submittedReports[0]?.value ?? 0),
      reviewsWritten: Number(accountReviews[0]?.value ?? 0),
      auditActions: Number(auditCount[0]?.value ?? 0),
    },
  });
});

router.get("/admin/users/:id/activity", requireAuth, requirePermission("users.read"), async (req, res): Promise<void> => {
  const id = uuid.safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ error: "Invalid user activity request" });
    return;
  }
  const [logRows, reportRows, verificationRows] = await Promise.all([
    db.select({
      id: auditLogs.id, kind: auditLogs.action, entityType: auditLogs.entityType,
      entityId: auditLogs.entityId, createdAt: auditLogs.createdAt,
    }).from(auditLogs).where(eq(auditLogs.actorUserId, id.data)).orderBy(desc(auditLogs.createdAt)).limit(100),
    db.select({
      id: contentReports.id, kind: sql<string>`'report_submitted'`,
      entityType: contentReports.entityType, entityId: contentReports.entityId,
      createdAt: contentReports.createdAt,
    }).from(contentReports).where(eq(contentReports.reporterId, id.data)).orderBy(desc(contentReports.createdAt)).limit(100),
    db.select({
      id: verificationHistory.id,
      kind: sql<string>`'verification_' || ${verificationHistory.newStatus}`,
      entityType: verificationHistory.entityType,
      entityId: verificationHistory.entityId,
      createdAt: verificationHistory.createdAt,
    }).from(verificationHistory).where(eq(verificationHistory.actorUserId, id.data)).orderBy(desc(verificationHistory.createdAt)).limit(100),
  ]);
  const activities = [...logRows, ...reportRows, ...verificationRows]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 100);
  res.json({ activities, page: 1, limit: 100, total: activities.length });
});

router.patch("/admin/users/:id/status", requireAuth, requirePermission("users.manage"), async (req, res): Promise<void> => {
  const id = uuid.safeParse(req.params.id);
  const body = z.object({ status: z.enum(["active", "suspended", "deleted"]), note: z.string().trim().max(1000).nullable().optional() }).safeParse(req.body);
  if (!id.success || !body.success) {
    res.status(400).json({ error: "Invalid account status action" });
    return;
  }
  if (!canWriteAdmin(req)) {
    res.status(429).json({ error: "Administrator action rate limit exceeded" });
    return;
  }
  if (id.data === req.user!.id) {
    res.status(409).json({ error: "Administrators cannot suspend or delete their own account" });
    return;
  }
  const [target] = await db.select({
    id: users.id, accountType: users.accountType, status: users.status,
    adminRole: adminRoleAssignments.role,
  }).from(users).leftJoin(adminRoleAssignments, eq(adminRoleAssignments.userId, users.id))
    .where(eq(users.id, id.data)).limit(1);
  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  if (target.adminRole === "super_admin") {
    res.status(409).json({ error: "A super administrator account cannot be suspended or deleted here" });
    return;
  }
  const [updated] = await db.update(users).set({ status: body.data.status, updatedAt: new Date() })
    .where(eq(users.id, id.data)).returning({
      id: users.id, fullName: users.fullName, accountType: users.accountType, status: users.status,
    });
  if (body.data.status !== "active") {
    await db.update(sessions).set({ revokedAt: new Date() })
      .where(and(eq(sessions.userId, id.data), isNull(sessions.revokedAt)));
  }
  await audit(req, `user.${body.data.status}`, "user", id.data, {
    previousStatus: target.status,
    note: body.data.note?.trim() || null,
  });
  res.json(updated);
});

router.patch("/admin/users/:id/verification", requireAuth, requirePermission("users.manage"), async (req, res): Promise<void> => {
  const id = uuid.safeParse(req.params.id);
  const body = z.object({ entityType: entityTypeSchema, note: z.string().trim().max(1000).nullable().optional() }).safeParse(req.body);
  if (!id.success || !body.success) {
    res.status(400).json({ error: "Invalid verification reset request" });
    return;
  }
  const [target] = await db.select({ id: users.id }).from(users).where(eq(users.id, id.data)).limit(1);
  const entity = await db.select().from(body.data.entityType === "business" ? businesses : serviceProviders)
    .where(eq(body.data.entityType === "business" ? businesses.ownerId : serviceProviders.ownerId, id.data)).limit(1);
  if (!target || !entity[0]) {
    res.status(404).json({ error: "User verification profile not found" });
    return;
  }
  const current = entity[0] as { id: string; verificationStatus: string; ownerId: string };
  const request = await db.transaction(async (tx) => {
    await tx.update(body.data.entityType === "business" ? businesses : serviceProviders)
      .set({ verificationStatus: "pending", approvedAt: null, updatedAt: new Date() })
      .where(eq(body.data.entityType === "business" ? businesses.id : serviceProviders.id, current.id));
    const [created] = await tx.insert(verificationRequests).values({
      entityType: body.data.entityType, entityId: current.id, ownerId: id.data,
      applicantNote: "Administrator reset the verification state.",
      status: "pending",
    }).returning();
    await tx.insert(verificationHistory).values({
      requestId: created!.id, entityType: body.data.entityType, entityId: current.id,
      previousStatus: current.verificationStatus, newStatus: "pending",
      note: body.data.note?.trim() || "Verification state reset by an administrator.",
      actorUserId: req.user!.id,
    });
    return created;
  });
  await audit(req, "verification.reset", body.data.entityType, current.id, { ownerId: id.data });
  res.json({ request, status: "pending" });
});

const moderationEntitySchema = z.enum(["business", "service_provider", "product", "service", "review", "chat_message"]);
type ModerationEntity = z.infer<typeof moderationEntitySchema>;
const moderationActionSchema = z.enum(["hide", "restore", "remove", "suspend", "unsuspend"]);

router.get("/admin/moderation/content", requireAuth, requirePermission("moderation.manage"), async (req, res): Promise<void> => {
  const query = z.object({
    entityType: moderationEntitySchema.optional(),
    query: z.string().trim().max(120).optional(),
    page: pageSchema,
    limit: z.coerce.number().int().min(1).max(50).default(20),
  }).safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: "Invalid moderation content filters" });
    return;
  }
  const types: ModerationEntity[] = query.data.entityType
    ? [query.data.entityType]
    : ["business", "service_provider", "product", "service", "review", "chat_message"];
  const search = query.data.query ? `%${query.data.query}%` : undefined;
  const perTypeLimit = Math.min(100, query.data.page * query.data.limit);
  const lists = await Promise.all(types.map(async (type) => {
    if (type === "business") {
      const rows = await db.select({
        id: businesses.id, title: businesses.businessName, ownerName: users.fullName,
        status: businesses.verificationStatus, createdAt: businesses.createdAt,
      }).from(businesses).innerJoin(users, eq(users.id, businesses.ownerId))
        .where(search ? ilike(businesses.businessName, search) : undefined)
        .orderBy(desc(businesses.createdAt)).limit(perTypeLimit);
      return rows.map((row) => ({ ...row, entityType: type, preview: row.title }));
    }
    if (type === "service_provider") {
      const rows = await db.select({
        id: serviceProviders.id, title: serviceProviders.profession, ownerName: users.fullName,
        status: serviceProviders.verificationStatus, createdAt: serviceProviders.createdAt,
      }).from(serviceProviders).innerJoin(users, eq(users.id, serviceProviders.ownerId))
        .where(search ? ilike(serviceProviders.profession, search) : undefined)
        .orderBy(desc(serviceProviders.createdAt)).limit(perTypeLimit);
      return rows.map((row) => ({ ...row, entityType: type, preview: row.title }));
    }
    if (type === "product") {
      const rows = await db.select({
        id: products.id, title: products.name, ownerName: users.fullName,
        status: products.isVisible, createdAt: products.createdAt,
      }).from(products).innerJoin(users, eq(users.id, products.ownerId))
        .where(search ? ilike(products.name, search) : undefined)
        .orderBy(desc(products.createdAt)).limit(perTypeLimit);
      return rows.map((row) => ({ ...row, entityType: type, preview: row.title, status: row.status ? "visible" : "hidden" }));
    }
    if (type === "service") {
      const rows = await db.select({
        id: services.id, title: services.name, ownerName: users.fullName,
        status: services.isVisible, createdAt: services.createdAt,
      }).from(services).innerJoin(users, eq(users.id, services.ownerId))
        .where(search ? ilike(services.name, search) : undefined)
        .orderBy(desc(services.createdAt)).limit(perTypeLimit);
      return rows.map((row) => ({ ...row, entityType: type, preview: row.title, status: row.status ? "visible" : "hidden" }));
    }
    if (type === "review") {
      const rows = await db.select({
        id: reviews.id, title: sql<string>`'Review by ' || ${users.fullName}`,
        ownerName: users.fullName, status: reviews.moderationStatus,
        createdAt: reviews.createdAt, preview: reviews.comment,
      }).from(reviews).innerJoin(users, eq(users.id, reviews.userId))
        .where(search ? ilike(reviews.comment, search) : undefined)
        .orderBy(desc(reviews.createdAt)).limit(perTypeLimit);
      return rows.map((row) => ({ ...row, entityType: type }));
    }
    const rows = await db.select({
      id: chatMessages.id, title: sql<string>`'Message by ' || ${users.fullName}`,
      ownerName: users.fullName,
      status: sql<string>`case when ${chatMessages.deletedAt} is null then 'visible' else 'hidden' end`,
      createdAt: chatMessages.createdAt, preview: chatMessages.body,
    }).from(chatMessages).innerJoin(users, eq(users.id, chatMessages.senderId))
      .where(search ? ilike(chatMessages.body, search) : undefined)
      .orderBy(desc(chatMessages.createdAt)).limit(perTypeLimit);
    return rows.map((row) => ({ ...row, entityType: type }));
  }));
  const entries = lists.flat().sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const total = entries.length;
  const start = (query.data.page - 1) * query.data.limit;
  res.json({
    results: entries.slice(start, start + query.data.limit),
    page: query.data.page,
    limit: query.data.limit,
    total,
    hasMore: total > start + query.data.limit,
  });
});

router.patch("/admin/moderation/content/:entityType/:entityId", requireAuth, requirePermission("moderation.manage"), async (req, res): Promise<void> => {
  const params = z.object({ entityType: moderationEntitySchema, entityId: uuid }).safeParse(req.params);
  const body = z.object({
    action: moderationActionSchema,
    reason: z.string().trim().min(2).max(1000),
  }).safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid moderation action" });
    return;
  }
  const { entityType, entityId } = params.data;
  const { action, reason } = body.data;
  const current = await getModerationTarget(entityType, entityId);
  if (!current) {
    res.status(404).json({ error: "Moderation target not found" });
    return;
  }
  const restore = action === "restore" || action === "unsuspend";
  const activeAction = restore
    ? await db.select().from(moderationActions).where(and(
      eq(moderationActions.entityType, entityType),
      eq(moderationActions.entityId, entityId),
      isNull(moderationActions.restoredAt),
    )).orderBy(desc(moderationActions.createdAt)).limit(1)
    : [];
  if (restore && !activeAction[0]) {
    res.status(409).json({ error: "There is no active moderation action to reverse" });
    return;
  }
  if (!restore && ((action === "hide" && ["business", "service_provider"].includes(entityType))
    || (action === "suspend" && !["business", "service_provider"].includes(entityType)))) {
    res.status(400).json({ error: "That moderation action is not supported for this item" });
    return;
  }
  const prior = restore ? (activeAction[0]!.previousState as Record<string, unknown> | null) : current.previousState;
  if (restore && !prior) {
    res.status(409).json({ error: "The previous moderation state is unavailable; refusing to overwrite it" });
    return;
  }
  const transactionResult = await db.transaction(async (tx) => {
    if (entityType === "business" || entityType === "service_provider") {
      const table = entityType === "business" ? businesses : serviceProviders;
      const status = action === "suspend"
        ? "suspended"
        : typeof prior?.verificationStatus === "string" ? prior.verificationStatus : "pending";
      await tx.update(table).set({
        verificationStatus: status,
        approvedAt: status === "approved" ? new Date() : null,
        updatedAt: new Date(),
      }).where(eq(table.id, entityId));
    } else if (entityType === "product" || entityType === "service") {
      const table = entityType === "product" ? products : services;
      const isVisible = restore ? Boolean(prior?.isVisible) : false;
      await tx.update(table).set({ isVisible, updatedAt: new Date() }).where(eq(table.id, entityId));
    } else if (entityType === "review") {
      const moderationStatus = restore && typeof prior?.moderationStatus === "string"
        ? prior.moderationStatus
        : action === "remove" ? "removed" : "hidden";
      await tx.update(reviews).set({ moderationStatus, updatedAt: new Date() }).where(eq(reviews.id, entityId));
    } else {
      await tx.update(chatMessages).set({
        deletedAt: restore && typeof prior?.deletedAt === "string" ? new Date(prior.deletedAt) : restore ? null : new Date(),
        deletedByUserId: restore && typeof prior?.deletedByUserId === "string" ? prior.deletedByUserId : restore ? null : req.user!.id,
      }).where(eq(chatMessages.id, entityId));
    }
    if (restore) {
      await tx.update(moderationActions).set({ restoredAt: new Date() })
        .where(eq(moderationActions.id, activeAction[0]!.id));
    } else {
      await tx.insert(moderationActions).values({
        entityType,
        entityId,
        action,
        previousState: current.previousState,
        actorUserId: req.user!.id,
      });
    }
    return true;
  });
  if (entityType === "review") {
    const [review] = await db.select({ targetType: reviews.targetType, targetId: reviews.targetId })
      .from(reviews).where(eq(reviews.id, entityId)).limit(1);
    if (review) await syncReviewSummary(review.targetType, review.targetId);
  }
  await audit(req, `moderation.${action}`, entityType, entityId, { reason });
  res.json({ entityType, entityId, action, updated: transactionResult });
});

async function getModerationTarget(entityType: ModerationEntity, entityId: string): Promise<{ previousState: Record<string, unknown> } | null> {
  if (entityType === "business") {
    const [row] = await db.select({ verificationStatus: businesses.verificationStatus, approvedAt: businesses.approvedAt })
      .from(businesses).where(eq(businesses.id, entityId)).limit(1);
    return row ? { previousState: row } : null;
  }
  if (entityType === "service_provider") {
    const [row] = await db.select({ verificationStatus: serviceProviders.verificationStatus, approvedAt: serviceProviders.approvedAt })
      .from(serviceProviders).where(eq(serviceProviders.id, entityId)).limit(1);
    return row ? { previousState: row } : null;
  }
  if (entityType === "product") {
    const [row] = await db.select({ isVisible: products.isVisible }).from(products).where(eq(products.id, entityId)).limit(1);
    return row ? { previousState: row } : null;
  }
  if (entityType === "service") {
    const [row] = await db.select({ isVisible: services.isVisible }).from(services).where(eq(services.id, entityId)).limit(1);
    return row ? { previousState: row } : null;
  }
  if (entityType === "review") {
    const [row] = await db.select({ moderationStatus: reviews.moderationStatus }).from(reviews).where(eq(reviews.id, entityId)).limit(1);
    return row ? { previousState: row } : null;
  }
  const [row] = await db.select({ deletedAt: chatMessages.deletedAt, deletedByUserId: chatMessages.deletedByUserId })
    .from(chatMessages).where(eq(chatMessages.id, entityId)).limit(1);
  return row ? { previousState: row } : null;
}

async function syncReviewSummary(targetType: string, targetId: string) {
  const [[aggregate]] = await Promise.all([
    db.select({
      average: sql<number>`coalesce(avg(${reviews.rating}), 0)`,
      amount: count(),
    }).from(reviews).where(and(
      eq(reviews.targetType, targetType),
      eq(reviews.targetId, targetId),
      eq(reviews.moderationStatus, "visible"),
    )),
  ]);
  const average = aggregate?.amount ? Number(aggregate.average).toFixed(1) : "0";
  if (targetType === "business") await db.update(businesses).set({ averageRating: average, totalReviews: Number(aggregate?.amount ?? 0) }).where(eq(businesses.id, targetId));
  else if (targetType === "product") await db.update(products).set({ averageRating: average, totalReviews: Number(aggregate?.amount ?? 0) }).where(eq(products.id, targetId));
  else if (targetType === "service") await db.update(services).set({ averageRating: average, totalReviews: Number(aggregate?.amount ?? 0) }).where(eq(services.id, targetId));
}

const PLATFORM_SETTINGS_KEY = "platform_settings_phase8";
const platformSettingsSchema = z.object({
  maintenanceMode: z.boolean(),
  customerRegistrationEnabled: z.boolean(),
  businessRegistrationEnabled: z.boolean(),
  providerRegistrationEnabled: z.boolean(),
  requireVerificationToPublish: z.boolean(),
  announcementsEnabled: z.boolean(),
  aiSearchEnabled: z.boolean(),
  supportContactEmail: z.string().trim().email().max(254).or(z.literal("")),
}).strict();
const defaultPlatformSettings = {
  maintenanceMode: false,
  customerRegistrationEnabled: true,
  businessRegistrationEnabled: true,
  providerRegistrationEnabled: true,
  requireVerificationToPublish: true,
  announcementsEnabled: true,
  aiSearchEnabled: true,
  supportContactEmail: "",
};

router.get("/admin/settings", requireAuth, requirePermission("settings.read"), async (_req, res): Promise<void> => {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, PLATFORM_SETTINGS_KEY)).limit(1);
  res.json({ settings: { ...defaultPlatformSettings, ...(row?.value as Partial<typeof defaultPlatformSettings> | undefined) }, updatedAt: row?.updatedAt ?? null });
});

router.put("/admin/settings", requireAuth, requirePermission("settings.manage"), async (req, res): Promise<void> => {
  const parsed = platformSettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid platform settings", details: parsed.error.flatten() });
    return;
  }
  if (!canWriteAdmin(req)) {
    res.status(429).json({ error: "Administrator action rate limit exceeded" });
    return;
  }
  const [saved] = await db.insert(appSettings).values({
    key: PLATFORM_SETTINGS_KEY,
    value: parsed.data,
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: appSettings.key,
    set: { value: parsed.data, updatedAt: new Date() },
  }).returning({ updatedAt: appSettings.updatedAt });
  await audit(req, "platform.settings.updated", "platform_settings", PLATFORM_SETTINGS_KEY);
  res.json({ settings: parsed.data, updatedAt: saved!.updatedAt });
});

export default router;
