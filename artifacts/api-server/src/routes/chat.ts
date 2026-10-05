import { Router, type IRouter } from "express";
import {
  and,
  count,
  desc,
  eq,
  exists,
  gt,
  ilike,
  inArray,
  isNull,
  lt,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  BlockChatUserParams,
  BlockChatUserResponse,
  CreateChatConversationBody,
  CreateChatConversationResponse,
  DeleteChatMessageParams,
  DeleteChatMessageResponse,
  ListChatConversationsQueryParams,
  ListChatConversationsResponse,
  ListChatBlocksResponse,
  ListChatMessagesQueryParams,
  ListChatMessagesResponse,
  MarkConversationReadParams,
  MarkConversationReadResponse,
  ReportChatConversationBody,
  ReportChatConversationParams,
  ReportChatConversationResponse,
  SendChatMessageBody,
  SendChatMessageParams,
  SendChatMessageResponse,
  UnblockChatUserParams,
  UnblockChatUserResponse,
  UpdateChatTypingBody,
  UpdateChatTypingParams,
  UpdateChatTypingResponse,
} from "@workspace/api-zod";
import { db } from "@workspace/db";
import {
  businesses,
  chatConversations,
  chatMessages,
  chatParticipants,
  contentReports,
  products,
  serviceProviders,
  services,
  userBlocks,
  users,
} from "@workspace/db/schema";
import { audit } from "../lib/audit";
import { createNotification } from "../lib/engagement";
import { requireAuth } from "../lib/auth";
import { consumeRateLimit } from "../lib/rate-limit";
import { attachUserEventStream, publishUserEvent } from "../lib/realtime";

const router: IRouter = Router();
const typingExpiry = new Map<string, Map<string, number>>();
const blockedPairCondition = (userId: string, otherUserId: string) =>
  or(
    and(eq(userBlocks.blockerId, userId), eq(userBlocks.blockedId, otherUserId)),
    and(eq(userBlocks.blockerId, otherUserId), eq(userBlocks.blockedId, userId)),
  );

async function isBlocked(userId: string, otherUserId: string) {
  const [block] = await db
    .select({ id: userBlocks.id })
    .from(userBlocks)
    .where(blockedPairCondition(userId, otherUserId))
    .limit(1);
  return Boolean(block);
}

async function resolveListingOwner(targetType: string, targetId: string) {
  if (targetType === "business") {
    const [business] = await db
      .select({ ownerId: businesses.ownerId })
      .from(businesses)
      .where(and(eq(businesses.id, targetId), eq(businesses.verificationStatus, "approved")))
      .limit(1);
    return business?.ownerId ?? null;
  }

  if (targetType === "service_provider") {
    const [provider] = await db
      .select({ ownerId: serviceProviders.ownerId })
      .from(serviceProviders)
      .where(and(eq(serviceProviders.id, targetId), eq(serviceProviders.verificationStatus, "approved")))
      .limit(1);
    return provider?.ownerId ?? null;
  }

  if (targetType === "product") {
    const [product] = await db
      .select({ ownerId: products.ownerId })
      .from(products)
      .innerJoin(businesses, eq(businesses.id, products.businessId))
      .where(and(
        eq(products.id, targetId),
        eq(products.status, "published"),
        eq(products.isVisible, true),
        eq(products.isAvailable, true),
        eq(businesses.verificationStatus, "approved"),
      ))
      .limit(1);
    return product?.ownerId ?? null;
  }

  if (targetType === "service") {
    const [service] = await db
      .select()
      .from(services)
      .where(and(
        eq(services.id, targetId),
        eq(services.status, "published"),
        eq(services.isVisible, true),
        eq(services.isAvailable, true),
      ))
      .limit(1);
    if (!service) return null;
    if (service.businessId) {
      const [business] = await db
        .select({ ownerId: businesses.ownerId })
        .from(businesses)
        .where(and(eq(businesses.id, service.businessId), eq(businesses.verificationStatus, "approved")))
        .limit(1);
      if (business) return service.ownerId;
    }
    if (service.providerId) {
      const [provider] = await db
        .select({ id: serviceProviders.id })
        .from(serviceProviders)
        .where(and(eq(serviceProviders.id, service.providerId), eq(serviceProviders.verificationStatus, "approved")))
        .limit(1);
      if (provider) return service.ownerId;
    }
  }
  return null;
}

async function loadConversationParticipants(conversationId: string, userId: string) {
  const members = await db
    .select({ participant: chatParticipants, user: users })
    .from(chatParticipants)
    .innerJoin(users, eq(users.id, chatParticipants.userId))
    .where(eq(chatParticipants.conversationId, conversationId));
  const own = members.find((member) => member.participant.userId === userId);
  const other = members.find((member) => member.participant.userId !== userId);
  return own && other ? { own, other } : null;
}

function outgoingStatus(
  createdAt: Date,
  deliveredAt: Date | null,
  senderId: string,
  ownUserId: string,
  ownReadAt: Date | null,
  otherReadAt: Date | null,
) {
  if (senderId === ownUserId) {
    if (otherReadAt && otherReadAt >= createdAt) return "read" as const;
    return deliveredAt ? "delivered" as const : "sent" as const;
  }
  if (ownReadAt && ownReadAt >= createdAt) return "read" as const;
  return deliveredAt ? "delivered" as const : "sent" as const;
}

function safeMessageBody(message: typeof chatMessages.$inferSelect) {
  return message.deletedAt ? "Message removed" : message.body;
}

async function conversationCard(conversationId: string, userId: string) {
  const [conversation] = await db
    .select()
    .from(chatConversations)
    .where(eq(chatConversations.id, conversationId))
    .limit(1);
  if (!conversation) return null;
  const participants = await loadConversationParticipants(conversationId, userId);
  if (!participants) return null;
  const [message] = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.conversationId, conversationId))
    .orderBy(desc(chatMessages.createdAt))
    .limit(1);
  const [unread] = await db
    .select({ value: count() })
    .from(chatMessages)
    .where(and(
      eq(chatMessages.conversationId, conversationId),
      ne(chatMessages.senderId, userId),
      participants.own.participant.lastReadAt
        ? gt(chatMessages.createdAt, participants.own.participant.lastReadAt)
        : undefined,
    ));
  return {
    id: conversation.id,
    otherUser: {
      id: participants.other.user.id,
      fullName: participants.other.user.fullName,
      profilePhoto: participants.other.user.profilePhoto,
      accountType: participants.other.user.accountType,
    },
    contextType: conversation.contextType,
    contextId: conversation.contextId,
    lastMessage: message
      ? {
          id: message.id,
          body: safeMessageBody(message),
          messageType: message.messageType,
          senderId: message.senderId,
          createdAt: message.createdAt,
          status: outgoingStatus(
            message.createdAt,
            message.deliveredAt,
            message.senderId,
            userId,
            participants.own.participant.lastReadAt,
            participants.other.participant.lastReadAt,
          ),
        }
      : null,
    lastMessageAt: conversation.lastMessageAt,
    unreadCount: Number(unread?.value ?? 0),
  };
}

router.get("/chat/events", requireAuth, (req, res) => {
  res.status(200);
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();
  attachUserEventStream(req.user!.id, res);
});

router.get("/chat/conversations", requireAuth, async (req, res): Promise<void> => {
  const parsed = ListChatConversationsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid conversation list request" });
    return;
  }
  const { page, limit, search } = parsed.data;
  const otherAccount = alias(users, "chat_other_account");
  const otherUserId = sql<string>`case when ${chatConversations.participantOneId} = ${req.user!.id} then ${chatConversations.participantTwoId} else ${chatConversations.participantOneId} end`;
  const where = and(
    eq(chatParticipants.userId, req.user!.id),
    isNull(chatParticipants.hiddenAt),
    search
      ? or(
          ilike(otherAccount.fullName, `%${search.replace(/[%_]/g, "\\$&")}%`),
          exists(
            db.select({ id: chatMessages.id })
              .from(chatMessages)
              .where(and(
                eq(chatMessages.conversationId, chatConversations.id),
                isNull(chatMessages.deletedAt),
                ilike(chatMessages.body, `%${search.replace(/[%_]/g, "\\$&")}%`),
              )),
          ),
        )
      : undefined,
  );
  const [totalRow] = await db
    .select({ total: count() })
    .from(chatParticipants)
    .innerJoin(chatConversations, eq(chatConversations.id, chatParticipants.conversationId))
    .innerJoin(otherAccount, eq(otherAccount.id, otherUserId))
    .where(where);
  const rows = await db
    .select({
      conversation: chatConversations,
      membership: chatParticipants,
      otherUser: {
        id: otherAccount.id,
        fullName: otherAccount.fullName,
        profilePhoto: otherAccount.profilePhoto,
        accountType: otherAccount.accountType,
      },
    })
    .from(chatParticipants)
    .innerJoin(chatConversations, eq(chatConversations.id, chatParticipants.conversationId))
    .innerJoin(otherAccount, eq(otherAccount.id, otherUserId))
    .where(where)
    .orderBy(desc(chatConversations.lastMessageAt))
    .limit(limit)
    .offset((page - 1) * limit);
  const conversationIds = rows.map((row) => row.conversation.id);
  const [lastMessages, unreadRows, participantReadRows] = conversationIds.length
    ? await Promise.all([
        db.selectDistinctOn([chatMessages.conversationId], { message: chatMessages })
          .from(chatMessages)
          .where(inArray(chatMessages.conversationId, conversationIds))
          .orderBy(chatMessages.conversationId, desc(chatMessages.createdAt)),
        db.select({ conversationId: chatMessages.conversationId, unread: count() })
          .from(chatMessages)
          .innerJoin(chatParticipants, and(
            eq(chatParticipants.conversationId, chatMessages.conversationId),
            eq(chatParticipants.userId, req.user!.id),
          ))
          .where(and(
            inArray(chatMessages.conversationId, conversationIds),
            ne(chatMessages.senderId, req.user!.id),
            or(isNull(chatParticipants.lastReadAt), gt(chatMessages.createdAt, chatParticipants.lastReadAt)),
          ))
          .groupBy(chatMessages.conversationId),
        db.select({
          conversationId: chatParticipants.conversationId,
          userId: chatParticipants.userId,
          lastReadAt: chatParticipants.lastReadAt,
        }).from(chatParticipants)
          .where(inArray(chatParticipants.conversationId, conversationIds)),
      ])
    : [[], [], []] as const;
  const lastMessageByConversation = new Map(lastMessages.map((row) => [row.message.conversationId, row.message]));
  const unreadByConversation = new Map(unreadRows.map((row) => [row.conversationId, Number(row.unread)]));
  const otherReadByConversation = new Map(
    participantReadRows
      .filter((row) => row.userId !== req.user!.id)
      .map((row) => [row.conversationId, row.lastReadAt]),
  );
  const payload = {
    conversations: rows.map((row) => {
      const message = lastMessageByConversation.get(row.conversation.id);
      return {
        id: row.conversation.id,
        otherUser: row.otherUser,
        contextType: row.conversation.contextType,
        contextId: row.conversation.contextId,
        lastMessage: message
          ? {
              id: message.id,
              body: safeMessageBody(message),
              messageType: message.messageType,
              senderId: message.senderId,
              createdAt: message.createdAt,
              status: outgoingStatus(
                message.createdAt,
                message.deliveredAt,
                message.senderId,
                req.user!.id,
                row.membership.lastReadAt,
                otherReadByConversation.get(row.conversation.id) ?? null,
              ),
            }
          : null,
        lastMessageAt: row.conversation.lastMessageAt,
        unreadCount: unreadByConversation.get(row.conversation.id) ?? 0,
      };
    }),
    page,
    limit,
    total: Number(totalRow?.total ?? 0),
    hasMore: page * limit < Number(totalRow?.total ?? 0),
  };
  res.json(ListChatConversationsResponse.parse(payload));
});

router.post("/chat/conversations", requireAuth, async (req, res): Promise<void> => {
  if (req.user!.accountType !== "customer") {
    res.status(403).json({ error: "Only customers can start a new conversation" });
    return;
  }
  const parsed = CreateChatConversationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid listing target" });
    return;
  }
  const { targetType, targetId } = parsed.data;
  const ownerId = await resolveListingOwner(targetType, targetId);
  if (!ownerId) {
    res.status(404).json({ error: "Public listing not found" });
    return;
  }
  if (ownerId === req.user!.id) {
    res.status(400).json({ error: "You cannot start a conversation with your own listing" });
    return;
  }
  const [owner] = await db.select().from(users).where(and(eq(users.id, ownerId), eq(users.status, "active"))).limit(1);
  if (!owner) {
    res.status(404).json({ error: "Listing owner is unavailable" });
    return;
  }
  if (await isBlocked(req.user!.id, ownerId)) {
    res.status(403).json({ error: "Messaging is unavailable for this user" });
    return;
  }
  const [participantOneId, participantTwoId] = [req.user!.id, ownerId].sort();
  const directKey = `${participantOneId}:${participantTwoId}`;
  const [inserted] = await db
    .insert(chatConversations)
    .values({
      participantOneId,
      participantTwoId,
      directKey,
      contextType: targetType,
      contextId: targetId,
      createdById: req.user!.id,
    })
    .onConflictDoNothing({ target: chatConversations.directKey })
    .returning();
  const [conversation] = inserted
    ? [inserted]
    : await db.select().from(chatConversations).where(eq(chatConversations.directKey, directKey)).limit(1);
  if (!conversation) {
    res.status(500).json({ error: "Unable to open conversation" });
    return;
  }
  await db.insert(chatParticipants).values([
    { conversationId: conversation.id, userId: participantOneId },
    { conversationId: conversation.id, userId: participantTwoId },
  ]).onConflictDoNothing();
  await db.update(chatParticipants)
    .set({ hiddenAt: null })
    .where(and(eq(chatParticipants.conversationId, conversation.id), eq(chatParticipants.userId, req.user!.id)));
  const card = await conversationCard(conversation.id, req.user!.id);
  if (!card) {
    res.status(500).json({ error: "Unable to load conversation" });
    return;
  }
  if (inserted) {
    await audit(req, "chat.conversation.created", "conversation", conversation.id, { targetType });
  }
  res.status(inserted ? 201 : 200).json(CreateChatConversationResponse.parse(card));
});

router.get("/chat/messages", requireAuth, async (req, res): Promise<void> => {
  const query = {
    ...req.query,
    ...(req.query.before === undefined ? {} : { before: new Date(String(req.query.before)) }),
  };
  const parsed = ListChatMessagesQueryParams.safeParse(query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid message list request" });
    return;
  }
  const { conversationId, before, limit } = parsed.data;
  const participants = await loadConversationParticipants(conversationId, req.user!.id);
  if (!participants) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }
  const now = new Date();
  await db.update(chatParticipants)
    .set({ lastReadAt: now, hiddenAt: null })
    .where(and(eq(chatParticipants.id, participants.own.participant.id), eq(chatParticipants.userId, req.user!.id)));
  await db.update(chatMessages)
    .set({ deliveredAt: now })
    .where(and(
      eq(chatMessages.conversationId, conversationId),
      ne(chatMessages.senderId, req.user!.id),
      isNull(chatMessages.deliveredAt),
    ));
  const conditions = [eq(chatMessages.conversationId, conversationId)];
  if (before) conditions.push(lt(chatMessages.createdAt, before));
  const rows = await db
    .select()
    .from(chatMessages)
    .where(and(...conditions))
    .orderBy(desc(chatMessages.createdAt))
    .limit(limit + 1);
  const hasMore = rows.length > limit;
  const pageRows = rows.slice(0, limit).reverse();
  const ownReadAt = now;
  const messages = pageRows.map((message) => ({
    id: message.id,
    conversationId: message.conversationId,
    senderId: message.senderId,
    messageType: message.messageType,
    body: safeMessageBody(message),
    metadata: message.deletedAt ? null : (message.metadata as Record<string, unknown> | null),
    createdAt: message.createdAt,
    deletedAt: message.deletedAt,
    status: outgoingStatus(
      message.createdAt,
      message.deliveredAt ?? (message.senderId !== req.user!.id ? now : null),
      message.senderId,
      req.user!.id,
      ownReadAt,
      participants.other.participant.lastReadAt,
    ),
    isMine: message.senderId === req.user!.id,
  }));
  const typingUsers = typingExpiry.get(conversationId);
  const typing = Boolean(typingUsers && [...typingUsers.entries()].some(([userId, expires]) => userId !== req.user!.id && expires > Date.now()));
  publishUserEvent(participants.other.participant.userId, { type: "read", conversationId });
  const payload = {
    messages,
    hasMore,
    nextBefore: hasMore && pageRows[0] ? pageRows[0].createdAt : null,
    typing,
  };
  res.json(ListChatMessagesResponse.parse(payload));
});

router.post("/chat/conversations/:id/messages", requireAuth, async (req, res): Promise<void> => {
  const params = SendChatMessageParams.safeParse(req.params);
  const parsed = SendChatMessageBody.safeParse(req.body);
  if (!params.success || !parsed.success || !parsed.data.body.trim()) {
    res.status(400).json({ error: "Enter a message up to 4,000 characters long" });
    return;
  }
  if (!consumeRateLimit(`chat-message:${req.user!.id}`, 30, 60_000)) {
    res.status(429).json({ error: "You are sending messages too quickly" });
    return;
  }
  const participants = await loadConversationParticipants(params.data.id, req.user!.id);
  if (!participants) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }
  if (await isBlocked(req.user!.id, participants.other.participant.userId)) {
    res.status(403).json({ error: "Messaging is unavailable for this user" });
    return;
  }
  const [message] = await db.insert(chatMessages).values({
    conversationId: params.data.id,
    senderId: req.user!.id,
    messageType: "text",
    body: parsed.data.body.trim(),
  }).returning();
  if (!message) {
    res.status(500).json({ error: "Unable to send message" });
    return;
  }
  await db.update(chatConversations)
    .set({ lastMessageAt: message.createdAt, updatedAt: new Date() })
    .where(eq(chatConversations.id, params.data.id));
  await db.update(chatParticipants)
    .set({ hiddenAt: null })
    .where(and(eq(chatParticipants.conversationId, params.data.id), eq(chatParticipants.userId, participants.other.participant.userId)));
  const messagePayload = {
    id: message.id,
    conversationId: message.conversationId,
    senderId: message.senderId,
    messageType: message.messageType,
    body: message.body,
    metadata: null,
    createdAt: message.createdAt,
    deletedAt: null,
    status: "sent" as const,
    isMine: true,
  };
  await createNotification(
    participants.other.participant.userId,
    "message",
    `New message from ${req.user!.fullName}`,
    message.body.slice(0, 160),
    "conversation",
    params.data.id,
  );
  publishUserEvent(req.user!.id, { type: "message", conversationId: params.data.id });
  publishUserEvent(participants.other.participant.userId, { type: "message", conversationId: params.data.id });
  await audit(req, "chat.message.created", "message", message.id, { conversationId: params.data.id });
  res.status(201).json(SendChatMessageResponse.parse(messagePayload));
});

router.put("/chat/conversations/:id/read", requireAuth, async (req, res): Promise<void> => {
  const params = MarkConversationReadParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid conversation id" });
    return;
  }
  const participants = await loadConversationParticipants(params.data.id, req.user!.id);
  if (!participants) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }
  const now = new Date();
  await db.update(chatParticipants)
    .set({ lastReadAt: now })
    .where(eq(chatParticipants.id, participants.own.participant.id));
  await db.update(chatMessages)
    .set({ deliveredAt: now })
    .where(and(
      eq(chatMessages.conversationId, params.data.id),
      ne(chatMessages.senderId, req.user!.id),
      isNull(chatMessages.deliveredAt),
    ));
  publishUserEvent(participants.other.participant.userId, { type: "read", conversationId: params.data.id });
  res.json(MarkConversationReadResponse.parse({ message: "Conversation marked as read" }));
});

router.put("/chat/conversations/:id/typing", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateChatTypingParams.safeParse(req.params);
  const parsed = UpdateChatTypingBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Invalid typing state" });
    return;
  }
  const participants = await loadConversationParticipants(params.data.id, req.user!.id);
  if (!participants) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }
  if (await isBlocked(req.user!.id, participants.other.participant.userId)) {
    res.status(403).json({ error: "Messaging is unavailable for this user" });
    return;
  }
  const active = typingExpiry.get(params.data.id) ?? new Map<string, number>();
  if (parsed.data.typing) active.set(req.user!.id, Date.now() + 5_000);
  else active.delete(req.user!.id);
  if (active.size) typingExpiry.set(params.data.id, active);
  else typingExpiry.delete(params.data.id);
  publishUserEvent(participants.other.participant.userId, {
    type: "typing",
    conversationId: params.data.id,
    userId: req.user!.id,
    typing: parsed.data.typing,
  });
  res.json(UpdateChatTypingResponse.parse({ message: "Typing state updated" }));
});

router.delete("/chat/messages/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteChatMessageParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid message id" });
    return;
  }
  const [message] = await db.select().from(chatMessages).where(eq(chatMessages.id, params.data.id)).limit(1);
  if (!message) {
    res.status(404).json({ error: "Message not found" });
    return;
  }
  if (message.senderId !== req.user!.id) {
    res.status(403).json({ error: "Only the sender can remove this message" });
    return;
  }
  if (!message.deletedAt) {
    await db.update(chatMessages)
      .set({ deletedAt: new Date(), deletedByUserId: req.user!.id })
      .where(eq(chatMessages.id, message.id));
    const participants = await loadConversationParticipants(message.conversationId, req.user!.id);
    if (participants) {
      publishUserEvent(req.user!.id, { type: "message", conversationId: message.conversationId });
      publishUserEvent(participants.other.participant.userId, { type: "message", conversationId: message.conversationId });
    }
    await audit(req, "chat.message.deleted", "message", message.id);
  }
  res.json(DeleteChatMessageResponse.parse({ message: "Message removed" }));
});

router.post("/chat/conversations/:id/report", requireAuth, async (req, res): Promise<void> => {
  const params = ReportChatConversationParams.safeParse(req.params);
  const parsed = ReportChatConversationBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Invalid conversation report" });
    return;
  }
  if (!consumeRateLimit(`chat-report:${req.user!.id}`, 5, 60 * 60_000)) {
    res.status(429).json({ error: "Report rate limit exceeded" });
    return;
  }
  const participants = await loadConversationParticipants(params.data.id, req.user!.id);
  if (!participants) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }
  const [report] = await db.insert(contentReports).values({
    reporterId: req.user!.id,
    entityType: "conversation",
    entityId: params.data.id,
    reason: parsed.data.reason,
    details: parsed.data.details ?? null,
  }).returning();
  await audit(req, "chat.conversation.reported", "report", report!.id);
  res.status(201).json(ReportChatConversationResponse.parse(report));
});

router.get("/chat/blocks", requireAuth, async (req, res): Promise<void> => {
  const rows = await db.select({
    id: users.id,
    fullName: users.fullName,
    profilePhoto: users.profilePhoto,
    accountType: users.accountType,
  }).from(userBlocks)
    .innerJoin(users, eq(users.id, userBlocks.blockedId))
    .where(eq(userBlocks.blockerId, req.user!.id))
    .orderBy(desc(userBlocks.createdAt));
  res.json(ListChatBlocksResponse.parse({ blockedUsers: rows }));
});

router.post("/chat/blocks/:userId", requireAuth, async (req, res): Promise<void> => {
  const params = BlockChatUserParams.safeParse(req.params);
  if (!params.success || params.data.userId === req.user!.id) {
    res.status(400).json({ error: "Choose another user to block" });
    return;
  }
  const [target] = await db.select({ id: users.id }).from(users)
    .where(and(eq(users.id, params.data.userId), eq(users.status, "active")))
    .limit(1);
  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const [created] = await db.insert(userBlocks)
    .values({ blockerId: req.user!.id, blockedId: params.data.userId })
    .onConflictDoNothing()
    .returning();
  if (created) {
    await audit(req, "chat.user.blocked", "user", params.data.userId);
    publishUserEvent(req.user!.id, { type: "blocks" });
  }
  res.json(BlockChatUserResponse.parse({ message: "User blocked" }));
});

router.delete("/chat/blocks/:userId", requireAuth, async (req, res): Promise<void> => {
  const params = UnblockChatUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid user id" });
    return;
  }
  const [removed] = await db.delete(userBlocks).where(and(
    eq(userBlocks.blockerId, req.user!.id),
    eq(userBlocks.blockedId, params.data.userId),
  )).returning();
  if (removed) {
    await audit(req, "chat.user.unblocked", "user", params.data.userId);
    publishUserEvent(req.user!.id, { type: "blocks" });
  }
  res.json(UnblockChatUserResponse.parse({ message: "User unblocked" }));
});

export default router;