import { Router, type IRouter } from "express";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { z } from "zod/v4";
import {
  CreateReviewBody,
  CreateReviewResponse,
  DeleteReviewParams,
  DeleteReviewResponse,
  GetMyReviewQueryParams,
  GetMyReviewResponse,
  GetRatingSummaryParams,
  GetRatingSummaryResponse,
  ListAdminReviewsQueryParams,
  ListAdminReviewsResponse,
  ListContentReportsQueryParams,
  ListContentReportsResponse,
  ListReviewsQueryParams,
  ListReviewsResponse,
  ModerateReviewBody,
  ModerateReviewParams,
  ModerateReviewResponse,
  ReportReviewBody,
  ReportReviewParams,
  ReportReviewResponse,
  UpdateContentReportBody,
  UpdateContentReportParams,
  UpdateContentReportResponse,
  UpdateReviewBody,
  UpdateReviewParams,
  UpdateReviewResponse,
} from "@workspace/api-zod";
import { db } from "@workspace/db";
import {
  businesses,
  chatMessages,
  chatParticipants,
  contentReports,
  products,
  reviews,
  adminRoleAssignments,
  serviceProviders,
  services,
  users,
} from "@workspace/db/schema";
import { audit } from "../lib/audit";
import { createNotification } from "../lib/engagement";
import { requireAuth, requireRole } from "../lib/auth";
import { requirePermission } from "../lib/admin-permissions";
import { consumeRateLimit } from "../lib/rate-limit";

const router: IRouter = Router();
type TargetType = "business" | "product" | "service";

async function findReviewTarget(targetType: TargetType, targetId: string) {
  if (targetType === "business") {
    const [row] = await db.select({ ownerId: businesses.ownerId }).from(businesses)
      .where(and(eq(businesses.id, targetId), eq(businesses.verificationStatus, "approved")))
      .limit(1);
    return row ?? null;
  }
  if (targetType === "product") {
    const [row] = await db.select({ ownerId: products.ownerId }).from(products)
      .innerJoin(businesses, eq(businesses.id, products.businessId))
      .where(and(
        eq(products.id, targetId),
        eq(products.status, "published"),
        eq(products.isVisible, true),
        eq(products.isAvailable, true),
        eq(businesses.verificationStatus, "approved"),
      ))
      .limit(1);
    return row ?? null;
  }
  const [service] = await db.select().from(services)
    .where(and(
      eq(services.id, targetId),
      eq(services.status, "published"),
      eq(services.isVisible, true),
      eq(services.isAvailable, true),
    ))
    .limit(1);
  if (!service) return null;
  if (service.businessId) {
    const [business] = await db.select({ id: businesses.id }).from(businesses)
      .where(and(eq(businesses.id, service.businessId), eq(businesses.verificationStatus, "approved")))
      .limit(1);
    if (business) return { ownerId: service.ownerId };
  }
  if (service.providerId) {
    const [provider] = await db.select({ id: serviceProviders.id }).from(serviceProviders)
      .where(and(eq(serviceProviders.id, service.providerId), eq(serviceProviders.verificationStatus, "approved")))
      .limit(1);
    if (provider) return { ownerId: service.ownerId };
  }
  return null;
}

async function ratingSummary(targetType: TargetType, targetId: string) {
  const where = and(
    eq(reviews.targetType, targetType),
    eq(reviews.targetId, targetId),
    eq(reviews.moderationStatus, "visible"),
  );
  const [[aggregate], buckets] = await Promise.all([
    db.select({
      average: sql<number>`coalesce(avg(${reviews.rating}), 0)`,
      ratingCount: count(),
    }).from(reviews).where(where),
    db.select({ rating: reviews.rating, amount: count() })
      .from(reviews)
      .where(where)
      .groupBy(reviews.rating),
  ]);
  const distribution = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
  for (const bucket of buckets) {
    if (bucket.rating >= 1 && bucket.rating <= 5) distribution[String(bucket.rating) as keyof typeof distribution] = Number(bucket.amount);
  }
  return {
    targetType,
    targetId,
    averageRating: Number(aggregate?.average ?? 0),
    ratingCount: Number(aggregate?.ratingCount ?? 0),
    distribution,
  };
}

async function syncRatingSummary(targetType: TargetType, targetId: string) {
  const summary = await ratingSummary(targetType, targetId);
  const averageRating = summary.ratingCount ? summary.averageRating.toFixed(1) : "0";
  if (targetType === "business") {
    await db.update(businesses).set({ averageRating, totalReviews: summary.ratingCount }).where(eq(businesses.id, targetId));
  } else if (targetType === "product") {
    await db.update(products).set({ averageRating, totalReviews: summary.ratingCount }).where(eq(products.id, targetId));
  } else {
    await db.update(services).set({ averageRating, totalReviews: summary.ratingCount }).where(eq(services.id, targetId));
  }
  return summary;
}

async function reviewDto(reviewId: string) {
  const [row] = await db.select({
    review: reviews,
    author: {
      id: users.id,
      fullName: users.fullName,
      profilePhoto: users.profilePhoto,
    },
  }).from(reviews)
    .innerJoin(users, eq(users.id, reviews.userId))
    .where(eq(reviews.id, reviewId))
    .limit(1);
  return row ? { ...row.review, author: row.author } : null;
}

async function pagedReviews(
  targetType: TargetType,
  targetId: string,
  page: number,
  limit: number,
  moderationStatus: "visible" | "hidden" = "visible",
) {
  const where = and(
    eq(reviews.targetType, targetType),
    eq(reviews.targetId, targetId),
    eq(reviews.moderationStatus, moderationStatus),
  );
  const [[totalRow], rows, summary] = await Promise.all([
    db.select({ total: count() }).from(reviews).where(where),
    db.select({
      review: reviews,
      author: { id: users.id, fullName: users.fullName, profilePhoto: users.profilePhoto },
    }).from(reviews)
      .innerJoin(users, eq(users.id, reviews.userId))
      .where(where)
      .orderBy(desc(reviews.createdAt))
      .limit(limit)
      .offset((page - 1) * limit),
    ratingSummary(targetType, targetId),
  ]);
  const total = Number(totalRow?.total ?? 0);
  return {
    reviews: rows.map(({ review, author }) => ({ ...review, author })),
    page,
    limit,
    total,
    hasMore: page * limit < total,
    summary,
  };
}

router.get("/ratings/:targetType/:targetId", async (req, res): Promise<void> => {
  const parsed = GetRatingSummaryParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid rating target" });
    return;
  }
  const { targetType, targetId } = parsed.data;
  if (!await findReviewTarget(targetType, targetId)) {
    res.status(404).json({ error: "Listing not found" });
    return;
  }
  res.json(GetRatingSummaryResponse.parse(await ratingSummary(targetType, targetId)));
});

router.get("/reviews", async (req, res): Promise<void> => {
  const parsed = ListReviewsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid review list request" });
    return;
  }
  const { targetType, targetId, page, limit } = parsed.data;
  if (!await findReviewTarget(targetType, targetId)) {
    res.status(404).json({ error: "Listing not found" });
    return;
  }
  res.json(ListReviewsResponse.parse(await pagedReviews(targetType, targetId, page, limit)));
});

router.get("/reviews/mine", requireAuth, requireRole("customer"), async (req, res): Promise<void> => {
  const parsed = GetMyReviewQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid review target" });
    return;
  }
  const [row] = await db.select({ id: reviews.id }).from(reviews)
    .where(and(
      eq(reviews.userId, req.user!.id),
      eq(reviews.targetType, parsed.data.targetType),
      eq(reviews.targetId, parsed.data.targetId),
    ))
    .limit(1);
  const review = row ? await reviewDto(row.id) : null;
  res.json(GetMyReviewResponse.parse({ review }));
});

router.post("/reviews", requireAuth, requireRole("customer"), async (req, res): Promise<void> => {
  const parsed = CreateReviewBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid review" });
    return;
  }
  if (!consumeRateLimit(`review-create:${req.user!.id}`, 5, 60 * 60_000)) {
    res.status(429).json({ error: "Review rate limit exceeded" });
    return;
  }
  const { targetType, targetId, rating } = parsed.data;
  const target = await findReviewTarget(targetType, targetId);
  if (!target) {
    res.status(404).json({ error: "Listing not found" });
    return;
  }
  if (target.ownerId === req.user!.id) {
    res.status(403).json({ error: "You cannot review your own listing" });
    return;
  }
  const comment = parsed.data.comment?.trim() || null;
  const [created] = await db.insert(reviews).values({
    userId: req.user!.id,
    targetType,
    targetId,
    rating,
    comment,
    verifiedCustomer: false,
    moderationStatus: "visible",
  }).onConflictDoNothing().returning({ id: reviews.id });
  if (!created) {
    res.status(409).json({ error: "You already reviewed this listing. Edit your existing review." });
    return;
  }
  await syncRatingSummary(targetType, targetId);
  const responseReview = await reviewDto(created.id);
  if (!responseReview) {
    res.status(500).json({ error: "Review was created but could not be loaded" });
    return;
  }
  await createNotification(
    target.ownerId,
    comment ? "review" : "rating",
    comment ? "New customer review" : "New customer rating",
    comment ? `${req.user!.fullName} left a review on your listing.` : `${req.user!.fullName} rated your listing.`,
    targetType,
    targetId,
  );
  await audit(req, "review.created", targetType, targetId, { reviewId: created.id, rating });
  res.status(201).json(CreateReviewResponse.parse(responseReview));
});

router.put("/reviews/:id", requireAuth, requireRole("customer"), async (req, res): Promise<void> => {
  const params = UpdateReviewParams.safeParse(req.params);
  const parsed = UpdateReviewBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Invalid review update" });
    return;
  }
  if (!consumeRateLimit(`review-update:${req.user!.id}`, 20, 60 * 60_000)) {
    res.status(429).json({ error: "Review update rate limit exceeded" });
    return;
  }
  const [updated] = await db.update(reviews)
    .set({ rating: parsed.data.rating, comment: parsed.data.comment?.trim() || null, updatedAt: new Date() })
    .where(and(eq(reviews.id, params.data.id), eq(reviews.userId, req.user!.id)))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Review not found" });
    return;
  }
  await syncRatingSummary(updated.targetType as TargetType, updated.targetId);
  const result = await reviewDto(updated.id);
  await audit(req, "review.updated", updated.targetType, updated.targetId, { reviewId: updated.id });
  res.json(UpdateReviewResponse.parse(result));
});

router.delete("/reviews/:id", requireAuth, requireRole("customer"), async (req, res): Promise<void> => {
  const params = DeleteReviewParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid review id" });
    return;
  }
  const [removed] = await db.delete(reviews)
    .where(and(eq(reviews.id, params.data.id), eq(reviews.userId, req.user!.id)))
    .returning({ targetType: reviews.targetType, targetId: reviews.targetId });
  if (!removed) {
    res.status(404).json({ error: "Review not found" });
    return;
  }
  await syncRatingSummary(removed.targetType as TargetType, removed.targetId);
  await audit(req, "review.deleted", removed.targetType, removed.targetId, { reviewId: params.data.id });
  res.json(DeleteReviewResponse.parse({ message: "Review deleted" }));
});

router.post("/reviews/:id/report", requireAuth, async (req, res): Promise<void> => {
  const params = ReportReviewParams.safeParse(req.params);
  const parsed = ReportReviewBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Invalid review report" });
    return;
  }
  if (!consumeRateLimit(`review-report:${req.user!.id}`, 5, 60 * 60_000)) {
    res.status(429).json({ error: "Report rate limit exceeded" });
    return;
  }
  const [review] = await db.select({ id: reviews.id }).from(reviews)
    .where(eq(reviews.id, params.data.id))
    .limit(1);
  if (!review) {
    res.status(404).json({ error: "Review not found" });
    return;
  }
  const [report] = await db.insert(contentReports).values({
    reporterId: req.user!.id,
    entityType: "review",
    entityId: params.data.id,
    reason: parsed.data.reason,
    details: parsed.data.details ?? null,
  }).returning();
  await audit(req, "review.reported", "report", report!.id);
  res.status(201).json(ReportReviewResponse.parse(report));
});

router.post("/reports", requireAuth, async (req, res): Promise<void> => {
  const parsed = z.object({
    entityType: z.enum(["business", "service_provider", "product", "service", "review", "chat_message"]),
    entityId: z.string().uuid(),
    reason: z.string().trim().min(2).max(80),
    details: z.string().trim().max(1000).nullable().optional(),
  }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid report" });
    return;
  }
  if (!consumeRateLimit(`content-report:${req.user!.id}`, 5, 60 * 60_000)) {
    res.status(429).json({ error: "Report rate limit exceeded" });
    return;
  }
  let ownerId: string | null = null;
  const { entityType, entityId } = parsed.data;
  if (entityType === "business") {
    const [target] = await db.select({ ownerId: businesses.ownerId }).from(businesses).where(eq(businesses.id, entityId)).limit(1);
    ownerId = target?.ownerId ?? null;
  } else if (entityType === "service_provider") {
    const [target] = await db.select({ ownerId: serviceProviders.ownerId }).from(serviceProviders).where(eq(serviceProviders.id, entityId)).limit(1);
    ownerId = target?.ownerId ?? null;
  } else if (entityType === "product") {
    const [target] = await db.select({ ownerId: products.ownerId }).from(products).where(eq(products.id, entityId)).limit(1);
    ownerId = target?.ownerId ?? null;
  } else if (entityType === "service") {
    const [target] = await db.select({ ownerId: services.ownerId }).from(services).where(eq(services.id, entityId)).limit(1);
    ownerId = target?.ownerId ?? null;
  } else if (entityType === "review") {
    const [target] = await db.select({ ownerId: reviews.userId }).from(reviews).where(eq(reviews.id, entityId)).limit(1);
    ownerId = target?.ownerId ?? null;
  } else {
    const [target] = await db.select({
      senderId: chatMessages.senderId,
      conversationId: chatMessages.conversationId,
    }).from(chatMessages).where(eq(chatMessages.id, entityId)).limit(1);
    if (target && target.senderId !== req.user!.id) {
      const [participant] = await db.select({ userId: chatParticipants.userId }).from(chatParticipants)
        .where(and(
          eq(chatParticipants.conversationId, target.conversationId),
          eq(chatParticipants.userId, req.user!.id),
        )).limit(1);
      if (participant) ownerId = target.senderId;
    }
  }
  if (!ownerId) {
    res.status(404).json({ error: "Report target not found or not available to this account" });
    return;
  }
  if (ownerId === req.user!.id) {
    res.status(403).json({ error: "You cannot report your own content" });
    return;
  }
  const [report] = await db.insert(contentReports).values({
    reporterId: req.user!.id,
    entityType,
    entityId,
    reason: parsed.data.reason,
    details: parsed.data.details?.trim() || null,
  }).returning();
  await audit(req, "content.reported", entityType, entityId, { reportId: report!.id });
  res.status(201).json(report);
});

router.get("/admin/reviews", requireAuth, requirePermission("moderation.manage"), async (req, res): Promise<void> => {
  const parsed = ListAdminReviewsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid moderation list request" });
    return;
  }
  const where = parsed.data.status ? eq(reviews.moderationStatus, parsed.data.status) : undefined;
  const [[totalRow], rows] = await Promise.all([
    db.select({ total: count() }).from(reviews).where(where),
    db.select({
      review: reviews,
      author: { id: users.id, fullName: users.fullName, profilePhoto: users.profilePhoto },
    }).from(reviews)
      .innerJoin(users, eq(users.id, reviews.userId))
      .where(where)
      .orderBy(desc(reviews.createdAt))
      .limit(parsed.data.limit)
      .offset((parsed.data.page - 1) * parsed.data.limit),
  ]);
  const total = Number(totalRow?.total ?? 0);
  res.json(ListAdminReviewsResponse.parse({
    reviews: rows.map(({ review, author }) => ({ ...review, author })),
    page: parsed.data.page,
    limit: parsed.data.limit,
    total,
    hasMore: parsed.data.page * parsed.data.limit < total,
  }));
});

router.patch("/admin/reviews/:id/moderation", requireAuth, requirePermission("moderation.manage"), async (req, res): Promise<void> => {
  const params = ModerateReviewParams.safeParse(req.params);
  const parsed = ModerateReviewBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Invalid moderation update" });
    return;
  }
  const [updated] = await db.update(reviews)
    .set({ moderationStatus: parsed.data.moderationStatus, updatedAt: new Date() })
    .where(eq(reviews.id, params.data.id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Review not found" });
    return;
  }
  await syncRatingSummary(updated.targetType as TargetType, updated.targetId);
  const result = await reviewDto(updated.id);
  await audit(req, "review.moderated", "review", updated.id, { moderationStatus: updated.moderationStatus });
  if (updated.moderationStatus !== "visible") {
    await createNotification(updated.userId, "account_activity", "Review hidden", "A review you submitted was hidden by moderation.", "review", updated.id);
  }
  res.json(ModerateReviewResponse.parse(result));
});

router.get("/admin/content-reports", requireAuth, requirePermission("reports.read"), async (req, res): Promise<void> => {
  const parsed = ListContentReportsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid report list request" });
    return;
  }
  const where = and(
    parsed.data.status ? eq(contentReports.status, parsed.data.status) : undefined,
    parsed.data.entityType ? eq(contentReports.entityType, parsed.data.entityType) : undefined,
  );
  const [[totalRow], reportsPage] = await Promise.all([
    db.select({ total: count() }).from(contentReports).where(where),
    db.select({
      report: contentReports,
      reporterName: users.fullName,
      reporterPhone: users.phone,
    }).from(contentReports)
      .innerJoin(users, eq(users.id, contentReports.reporterId))
      .where(where)
      .orderBy(desc(contentReports.createdAt))
      .limit(parsed.data.limit)
      .offset((parsed.data.page - 1) * parsed.data.limit),
  ]);
  const total = Number(totalRow?.total ?? 0);
  res.json(ListContentReportsResponse.parse({
    reports: reportsPage.map(({ report, reporterName, reporterPhone }) => ({ ...report, reporterName, reporterPhone })),
    page: parsed.data.page,
    limit: parsed.data.limit,
    total,
    hasMore: parsed.data.page * parsed.data.limit < total,
  }));
});

router.patch("/admin/content-reports/:id", requireAuth, requirePermission("reports.manage"), async (req, res): Promise<void> => {
  const params = UpdateContentReportParams.safeParse(req.params);
  const parsed = UpdateContentReportBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Invalid report update" });
    return;
  }
  if (parsed.data.assignedToId) {
    const [assignee] = await db.select({ id: users.id }).from(users)
      .innerJoin(adminRoleAssignments, eq(adminRoleAssignments.userId, users.id))
      .where(and(
        eq(users.id, parsed.data.assignedToId),
        eq(users.accountType, "admin"),
        eq(users.status, "active"),
      )).limit(1);
    if (!assignee) {
      res.status(400).json({ error: "Reports can only be assigned to active administrators" });
      return;
    }
  }
  const [updated] = await db.update(contentReports)
    .set({
      status: parsed.data.status,
      ...(parsed.data.adminNote !== undefined ? { adminNote: parsed.data.adminNote?.trim() || null } : {}),
      ...(parsed.data.assignedToId !== undefined ? { assignedToId: parsed.data.assignedToId } : {}),
      reviewedById: req.user!.id,
      reviewedAt: parsed.data.status === "open" ? null : new Date(),
    })
    .where(eq(contentReports.id, params.data.id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Report not found" });
    return;
  }
  await audit(req, "content-report.reviewed", "report", updated.id, { status: updated.status });
  res.json(UpdateContentReportResponse.parse(updated));
});

export default router;