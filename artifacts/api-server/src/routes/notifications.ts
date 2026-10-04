import { Router, type IRouter } from "express";
import { and, count, desc, eq, inArray, isNull } from "drizzle-orm";
import {
  CreateNotificationAnnouncementBody,
  CreateNotificationAnnouncementResponse,
  GetNotificationPreferencesResponse,
  GetNotificationUnreadCountResponse,
  ListNotificationsQueryParams,
  ListNotificationsResponse,
  MarkAllNotificationsReadResponse,
  MarkNotificationReadParams,
  MarkNotificationReadResponse,
  UpdateNotificationPreferencesBody,
  UpdateNotificationPreferencesResponse,
} from "@workspace/api-zod";
import { db } from "@workspace/db";
import { notificationPreferences, notifications, users } from "@workspace/db/schema";
import { audit } from "../lib/audit";
import { requireAuth, requireRole } from "../lib/auth";
import { publishUserEvent } from "../lib/realtime";

const router: IRouter = Router();

function serializePreferences(preferences?: typeof notificationPreferences.$inferSelect) {
  return {
    messages: preferences?.messages ?? true,
    favorites: preferences?.favorites ?? true,
    verification: preferences?.verification ?? true,
    reviews: preferences?.reviews ?? true,
    ratings: preferences?.ratings ?? true,
    announcements: preferences?.announcements ?? true,
    accountActivity: preferences?.accountActivity ?? true,
  };
}

router.get("/notifications", requireAuth, async (req, res): Promise<void> => {
  const query = {
    ...req.query,
    ...(req.query.unreadOnly === undefined ? {} : { unreadOnly: req.query.unreadOnly === "true" }),
  };
  const parsed = ListNotificationsQueryParams.safeParse(query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid notification list request" });
    return;
  }
  const { page, limit, unreadOnly } = parsed.data;
  const userFilter = eq(notifications.userId, req.user!.id);
  const filters = unreadOnly ? and(userFilter, isNull(notifications.readAt)) : userFilter;
  const [[totalRow], [unreadRow], rows] = await Promise.all([
    db.select({ total: count() }).from(notifications).where(filters),
    db.select({ unread: count() }).from(notifications).where(and(userFilter, isNull(notifications.readAt))),
    db.select().from(notifications).where(filters)
      .orderBy(desc(notifications.createdAt))
      .limit(limit)
      .offset((page - 1) * limit),
  ]);
  const total = Number(totalRow?.total ?? 0);
  res.json(ListNotificationsResponse.parse({
    notifications: rows,
    page,
    limit,
    total,
    unreadCount: Number(unreadRow?.unread ?? 0),
    hasMore: page * limit < total,
  }));
});

router.get("/notifications/unread-count", requireAuth, async (req, res): Promise<void> => {
  const [row] = await db.select({ unreadCount: count() }).from(notifications)
    .where(and(eq(notifications.userId, req.user!.id), isNull(notifications.readAt)));
  res.json(GetNotificationUnreadCountResponse.parse({ unreadCount: Number(row?.unreadCount ?? 0) }));
});

router.put("/notifications/:id/read", requireAuth, async (req, res): Promise<void> => {
  const params = MarkNotificationReadParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid notification id" });
    return;
  }
  const [notification] = await db.update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.id, params.data.id), eq(notifications.userId, req.user!.id)))
    .returning();
  if (!notification) {
    res.status(404).json({ error: "Notification not found" });
    return;
  }
  publishUserEvent(req.user!.id, { type: "notification-read", entityType: notification.entityType ?? undefined, entityId: notification.entityId ?? undefined });
  res.json(MarkNotificationReadResponse.parse(notification));
});

router.put("/notifications/read-all", requireAuth, async (req, res): Promise<void> => {
  const rows = await db.update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, req.user!.id), isNull(notifications.readAt)))
    .returning({ id: notifications.id });
  publishUserEvent(req.user!.id, { type: "notification-read-all" });
  res.json(MarkAllNotificationsReadResponse.parse({ updated: rows.length }));
});

router.get("/notifications/preferences", requireAuth, async (req, res): Promise<void> => {
  const [preferences] = await db.select().from(notificationPreferences)
    .where(eq(notificationPreferences.userId, req.user!.id))
    .limit(1);
  res.json(GetNotificationPreferencesResponse.parse(serializePreferences(preferences)));
});

router.put("/notifications/preferences", requireAuth, async (req, res): Promise<void> => {
  const parsed = UpdateNotificationPreferencesBody.safeParse(req.body);
  if (!parsed.success || !Object.keys(parsed.data).length) {
    res.status(400).json({ error: "Choose at least one preference to update" });
    return;
  }
  const [current] = await db.select().from(notificationPreferences)
    .where(eq(notificationPreferences.userId, req.user!.id))
    .limit(1);
  const next = {
    messages: parsed.data.messages ?? current?.messages ?? true,
    favorites: parsed.data.favorites ?? current?.favorites ?? true,
    verification: parsed.data.verification ?? current?.verification ?? true,
    reviews: parsed.data.reviews ?? current?.reviews ?? true,
    ratings: parsed.data.ratings ?? current?.ratings ?? true,
    announcements: parsed.data.announcements ?? current?.announcements ?? true,
    accountActivity: parsed.data.accountActivity ?? current?.accountActivity ?? true,
  };
  await db.insert(notificationPreferences)
    .values({ userId: req.user!.id, ...next, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: notificationPreferences.userId,
      set: { ...next, updatedAt: new Date() },
    });
  await audit(req, "notifications.preferences.updated", "user", req.user!.id);
  res.json(UpdateNotificationPreferencesResponse.parse(next));
});

router.post("/admin/notifications/announcements", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const parsed = CreateNotificationAnnouncementBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid announcement" });
    return;
  }
  const activeUsers = await db.select({ id: users.id }).from(users)
    .where(and(eq(users.status, "active"), eq(users.notificationsEnabled, true)));
  const userIds = activeUsers.map((user) => user.id);
  const preferenceRows = userIds.length
    ? await db.select().from(notificationPreferences).where(inArray(notificationPreferences.userId, userIds))
    : [];
  const preferencesByUser = new Map(preferenceRows.map((row) => [row.userId, row]));
  const recipients = userIds.filter((userId) => preferencesByUser.get(userId)?.announcements ?? true);
  let created = 0;
  for (let index = 0; index < recipients.length; index += 500) {
    const batch = recipients.slice(index, index + 500);
    const rows = await db.insert(notifications).values(batch.map((userId) => ({
      userId,
      type: "announcement",
      title: parsed.data.title.trim(),
      message: parsed.data.message.trim(),
      entityType: parsed.data.entityType ?? null,
      entityId: parsed.data.entityId ?? null,
    }))).returning({ id: notifications.id, userId: notifications.userId });
    created += rows.length;
  }
  for (const userId of recipients) {
    publishUserEvent(userId, {
      type: "notification",
      entityType: parsed.data.entityType ?? undefined,
      entityId: parsed.data.entityId ?? undefined,
    });
  }
  await audit(req, "notifications.announcement.created", "announcement", parsed.data.entityId ?? undefined, { recipientCount: created });
  res.status(201).json(CreateNotificationAnnouncementResponse.parse({ created }));
});

export default router;