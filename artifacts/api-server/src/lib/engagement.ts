import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { notificationPreferences, notifications, users } from "@workspace/db/schema";
import { publishUserEvent } from "./realtime";

export type NotificationType =
  | "message"
  | "favorite"
  | "verification"
  | "review"
  | "rating"
  | "announcement"
  | "account_activity";

const preferenceForType: Record<NotificationType, keyof Omit<typeof notificationPreferences.$inferSelect, "id" | "userId" | "updatedAt">> = {
  message: "messages",
  favorite: "favorites",
  verification: "verification",
  review: "reviews",
  rating: "ratings",
  announcement: "announcements",
  account_activity: "accountActivity",
};

export async function createNotification(
  userId: string,
  type: NotificationType,
  title: string,
  message: string,
  entityType?: string | null,
  entityId?: string | null,
) {
  const [user] = await db
    .select({ enabled: users.notificationsEnabled, status: users.status })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user || user.status !== "active" || !user.enabled) return null;

  const [preferences] = await db
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId))
    .limit(1);
  if (preferences && !preferences[preferenceForType[type]]) return null;

  const [notification] = await db
    .insert(notifications)
    .values({
      userId,
      type,
      title: title.trim().slice(0, 120),
      message: message.trim().slice(0, 1000),
      entityType: entityType ?? null,
      entityId: entityId ?? null,
    })
    .returning();
  if (notification) publishUserEvent(userId, { type: "notification", entityType: notification.entityType ?? undefined, entityId: notification.entityId ?? undefined });
  return notification ?? null;
}