import { randomUUID } from "node:crypto";
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  AiSearchBody,
  GetAIRecommendationsQueryParams,
  GetAISuggestionsQueryParams,
  UpdateAIPreferencesBody,
} from "@workspace/api-zod";
import { db } from "@workspace/db";
import { aiPreferences, aiSearchHistory } from "@workspace/db/schema";
import {
  aiProvider,
  createSearchSuggestions,
  type AIConversationContext,
  type AIIntentKind,
  type AISearchIntent,
} from "../lib/ai-provider";
import {
  findAIResults,
  flattenAIResults,
  rankRecommendationCards,
} from "../lib/ai-recommendations";
import { loadSession } from "../lib/auth";

const router: IRouter = Router();
const defaultPreferences = {
  recommendationsEnabled: true,
  personalizedRecommendations: false,
  saveSearchHistory: true,
  preferredCategories: [] as string[],
};

type ConversationEntry = {
  expiresAt: number;
  context: AIConversationContext;
};

const anonymousConversations = new Map<string, ConversationEntry>();
const rateBuckets = new Map<string, { startedAt: number; count: number }>();

function rateLimit(req: Request, res: Response, next: NextFunction) {
  const now = Date.now();
  const key = req.ip ?? "unknown";
  for (const [bucketKey, bucket] of rateBuckets) {
    if (now - bucket.startedAt >= 120_000) rateBuckets.delete(bucketKey);
  }
  const existing = rateBuckets.get(key);
  if (!existing || now - existing.startedAt >= 60_000) {
    rateBuckets.set(key, { startedAt: now, count: 1 });
    next();
    return;
  }
  if (existing.count >= 30) {
    res.setHeader("Retry-After", "60");
    res.status(429).json({ error: "AI request limit reached. Try again in a minute." });
    return;
  }
  existing.count += 1;
  next();
}

router.use(rateLimit);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function conversationContext(value: unknown): AIConversationContext {
  if (!isRecord(value)) return {};
  const intent = isRecord(value.intent) ? value.intent : value;
  const kind = intent.kind;
  const validKinds: AIIntentKind[] = [
    "marketplace_discovery",
    "business_search",
    "product_search",
    "service_search",
  ];
  const filters = isRecord(intent.filters) ? intent.filters : undefined;
  const context: AIConversationContext = {};
  if (typeof kind === "string" && validKinds.includes(kind as AIIntentKind)) context.kind = kind as AIIntentKind;
  if (typeof intent.normalizedQuery === "string") context.normalizedQuery = intent.normalizedQuery.slice(0, 240);
  if (typeof intent.category === "string" || intent.category === null) context.category = intent.category;
  if (typeof intent.location === "string" || intent.location === null) context.location = intent.location;
  if (Array.isArray(intent.unsupportedFilters)) {
    context.unsupportedFilters = intent.unsupportedFilters.filter((item): item is string => typeof item === "string").slice(0, 4);
  }
  if (filters) {
    context.filters = {
      nearMe: filters.nearMe === true,
      verified: filters.verified === true,
      featured: filters.featured === true,
      newest: filters.newest === true,
      openNow: filters.openNow === true,
      minPriceCents: typeof filters.minPriceCents === "number" ? filters.minPriceCents : null,
      maxPriceCents: typeof filters.maxPriceCents === "number" ? filters.maxPriceCents : null,
    };
  }
  return context;
}

function conversationKey(userId: string | null, conversationId: string) {
  return `${userId ?? "anonymous"}:${conversationId}`;
}

async function previousContext(userId: string | null, conversationId: string): Promise<AIConversationContext | null> {
  const key = conversationKey(userId, conversationId);
  const memory = anonymousConversations.get(key);
  if (memory && memory.expiresAt >= Date.now()) return memory.context;
  if (memory) anonymousConversations.delete(key);
  if (!userId) {
    return null;
  }
  const [entry] = await db.select({ response: aiSearchHistory.response })
    .from(aiSearchHistory)
    .where(and(
      eq(aiSearchHistory.userId, userId),
      eq(aiSearchHistory.conversationId, conversationId),
    ))
    .orderBy(desc(aiSearchHistory.createdAt))
    .limit(1);
  return entry ? conversationContext(entry.response) : null;
}

function formatPreferences(row?: typeof aiPreferences.$inferSelect) {
  return row ? {
    recommendationsEnabled: row.recommendationsEnabled,
    personalizedRecommendations: row.personalizedRecommendations,
    saveSearchHistory: row.saveSearchHistory,
    preferredCategories: Array.isArray(row.preferredCategories) ? row.preferredCategories : [],
  } : defaultPreferences;
}

async function loadPreferences(userId: string) {
  const [row] = await db.select().from(aiPreferences).where(eq(aiPreferences.userId, userId)).limit(1);
  return formatPreferences(row);
}

function makeAnswer(intent: AISearchIntent, resultsCount: number) {
  if (resultsCount > 0) {
    const target = intent.category ? ` for ${intent.category}` : "";
    return `I found ${resultsCount} public marketplace listing${resultsCount === 1 ? "" : "s"}${target}. You can refine the results with the suggestions below.`;
  }
  const topic = intent.normalizedQuery || intent.category || "that search";
  return `I couldn't find a matching public listing for ${topic}. Try a nearby area, a broader category, or one of the suggested searches.`;
}

function suggestedFilters(intent: AISearchIntent, city?: string, state?: string) {
  return [
    ...(intent.filters.nearMe ? ["Nearby (requires location permission)"] : []),
    ...(intent.filters.verified ? ["Verified listings"] : []),
    ...(intent.filters.featured ? ["Featured listings"] : []),
    ...(intent.filters.newest ? ["Newest first"] : []),
    ...(intent.filters.minPriceCents !== null ? [`At least ₦${(intent.filters.minPriceCents / 100).toLocaleString()}`] : []),
    ...(intent.filters.maxPriceCents !== null ? [`Up to ₦${(intent.filters.maxPriceCents / 100).toLocaleString()}`] : []),
    ...(city ? [`In ${city}`] : []),
    ...(state ? [`In ${state}`] : []),
  ];
}

function intentWithOverrides(
  intent: AISearchIntent,
  input: ReturnType<typeof AiSearchBody.parse>,
): AISearchIntent {
  const kind = input.entityType === "businesses"
    ? "business_search"
    : input.entityType === "products"
      ? "product_search"
      : input.entityType === "services"
        ? "service_search"
        : intent.kind;
  return {
    ...intent,
    kind,
    filters: {
      ...intent.filters,
      verified: input.verified ?? intent.filters.verified,
      featured: input.featured ?? intent.filters.featured,
      newest: input.newest ?? intent.filters.newest,
    },
    unsupportedFilters: Array.from(new Set([
      ...intent.unsupportedFilters,
      ...((input.featured ?? intent.filters.featured) && intent.kind !== "product_search"
        ? ["Only product and service listings have a featured flag; business and provider profiles are not included when filtering by featured."]
        : []),
      ...((intent.filters.nearMe || input.query.toLowerCase().includes("near me")) && input.latitude === undefined
        ? ["Nearby filtering needs your location; results are not distance-filtered for this request."]
        : []),
    ])),
  };
}

router.post("/ai/search", async (req, res) => {
  const parsed = AiSearchBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid search request", details: parsed.error.issues.map(({ path, message }) => ({ path, message })) });
    return;
  }
  const input = parsed.data;
  if (!input.query.trim()) {
    res.status(400).json({ error: "Search query cannot be empty" });
    return;
  }
  const hasLatitude = input.latitude !== undefined;
  const hasLongitude = input.longitude !== undefined;
  if (hasLatitude !== hasLongitude) {
    res.status(400).json({ error: "Latitude and longitude must be provided together" });
    return;
  }

  try {
    const user = await loadSession(req);
    const userId = user?.id ?? null;
    const conversationId = input.conversationId ?? randomUUID();
    const previous = await previousContext(userId, conversationId);
    const analyzed = await aiProvider.analyze({
      query: input.query,
      previousContext: previous,
      language: user?.preferredLanguage ?? "en",
      modality: "text",
    });
    const intent = intentWithOverrides(analyzed, input);
    const preferences = userId ? await loadPreferences(userId) : defaultPreferences;
    const results = await findAIResults(intent, {
      latitude: input.latitude,
      longitude: input.longitude,
      radiusKm: input.radiusKm,
      city: input.city,
      state: input.state,
      preferredCategories: preferences.personalizedRecommendations ? preferences.preferredCategories : [],
    });
    const resultCount = results.businesses.length + results.serviceProviders.length + results.products.length + results.services.length;
    const suggestions = createSearchSuggestions(input.query, intent);
    let historySaved = false;
    const historyResponse = { intent };

    if (userId && preferences.saveSearchHistory) {
      await db.insert(aiSearchHistory).values({
        userId,
        conversationId,
        question: input.query.trim().slice(0, 240),
        response: historyResponse,
      });
      historySaved = true;
      const stale = await db.select({ id: aiSearchHistory.id })
        .from(aiSearchHistory)
        .where(eq(aiSearchHistory.userId, userId))
        .orderBy(desc(aiSearchHistory.createdAt))
        .limit(100)
        .offset(100);
      if (stale.length) {
        await db.delete(aiSearchHistory).where(inArray(aiSearchHistory.id, stale.map((entry) => entry.id)));
      }
    } else {
      for (const [key, value] of anonymousConversations) {
        if (value.expiresAt < Date.now()) anonymousConversations.delete(key);
      }
      if (anonymousConversations.size >= 500) {
        const oldest = anonymousConversations.keys().next().value;
        if (oldest) anonymousConversations.delete(oldest);
      }
      anonymousConversations.set(conversationKey(userId, conversationId), {
        context: intent,
        expiresAt: Date.now() + 30 * 60_000,
      });
    }

    req.log.info({
      provider: aiProvider.name,
      intent: intent.kind,
      resultCount,
      historySaved,
      locationProvided: hasLatitude,
    }, "AI marketplace search completed");

    res.json({
      provider: aiProvider.name,
      conversationId,
      answer: makeAnswer(intent, resultCount),
      intent,
      results: {
        businesses: results.businesses,
        serviceProviders: results.serviceProviders,
        products: results.products,
        services: results.services,
      },
      suggestedFilters: suggestedFilters(intent, input.city, input.state),
      suggestedCategories: suggestions.suggestedCategories,
      suggestedNextSearches: suggestions.suggestedNextSearches,
      relatedSearches: suggestions.relatedSearches,
      correction: suggestions.correction,
      disclaimer: "Results use only public, approved listings. Distance is calculated only when you share a location and the listing owner has enabled public location. Suggestions are not guarantees of availability.",
      historySaved,
    });
  } catch (error) {
    req.log.error({ err: error }, "AI marketplace search failed");
    res.status(500).json({ error: "AI search is temporarily unavailable" });
  }
});

router.get("/ai/recommendations", async (req, res) => {
  const parsed = GetAIRecommendationsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid recommendation request" });
    return;
  }
  const input = parsed.data;
  if ((input.latitude === undefined) !== (input.longitude === undefined)) {
    res.status(400).json({ error: "Latitude and longitude must be provided together" });
    return;
  }

  try {
    const user = await loadSession(req);
    const preferences = user ? await loadPreferences(user.id) : defaultPreferences;
    const history = user && preferences.personalizedRecommendations
      ? await db.select({ question: aiSearchHistory.question })
        .from(aiSearchHistory)
        .where(eq(aiSearchHistory.userId, user.id))
        .orderBy(desc(aiSearchHistory.createdAt))
        .limit(12)
      : [];
    const continueBrowsing = Array.from(new Set(history.map(({ question }) => question.trim()).filter(Boolean))).slice(0, 6);
    const empty = {
      recommendationsEnabled: preferences.recommendationsEnabled,
      personalized: Boolean(user && preferences.personalizedRecommendations),
      locationAware: input.latitude !== undefined && input.longitude !== undefined,
      recommendedForYou: [],
      trendingNearYou: [],
      popularThisWeek: [],
      aiSuggestions: createSearchSuggestions("", await aiProvider.analyze({ query: "" })).relatedSearches,
      recentlyViewed: [],
      continueBrowsing,
      message: null as string | null,
    };
    if (!preferences.recommendationsEnabled) {
      res.json({ ...empty, recommendedForYou: [], trendingNearYou: [], popularThisWeek: [], message: "AI recommendations are disabled in your preferences." });
      return;
    }

    const intent = await aiProvider.analyze({ query: "" });
    const results = await findAIResults(intent, {
      latitude: input.latitude,
      longitude: input.longitude,
      radiusKm: input.radiusKm,
      preferredCategories: preferences.personalizedRecommendations ? preferences.preferredCategories : [],
      limit: 80,
    });
    const cards = flattenAIResults(results);
    const weekAgo = Date.now() - 7 * 24 * 60 * 60_000;
    const recentPopular = cards.filter((card) => Date.parse(card.createdAt) >= weekAgo).slice(0, 6);
    const trending = input.latitude !== undefined && input.longitude !== undefined
      ? rankRecommendationCards(cards, "nearby", 6)
      : cards.slice(0, 6);
    res.json({
      ...empty,
      recommendedForYou: cards.slice(0, 6),
      trendingNearYou: trending,
      popularThisWeek: recentPopular.map((card) => ({ ...card, reason: "Recent listing ranked by available engagement signals" })),
      aiSuggestions: createSearchSuggestions("", intent).relatedSearches,
      message: "Weekly engagement and recently viewed events are not stored yet; popularity uses available listing totals and recent listing dates.",
    });
  } catch (error) {
    req.log.error({ err: error }, "AI recommendations failed");
    res.status(500).json({ error: "AI recommendations are temporarily unavailable" });
  }
});

router.get("/ai/suggestions", async (req, res) => {
  const parsed = GetAISuggestionsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid suggestion request" });
    return;
  }
  try {
    const query = parsed.data.query ?? "";
    const intent = await aiProvider.analyze({ query });
    res.json(createSearchSuggestions(query, intent));
  } catch (error) {
    req.log.error({ err: error }, "AI suggestions failed");
    res.status(500).json({ error: "AI suggestions are temporarily unavailable" });
  }
});

router.get("/ai/history", async (req, res) => {
  try {
    const user = await loadSession(req);
    if (!user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    const history = await db.select().from(aiSearchHistory)
      .where(eq(aiSearchHistory.userId, user.id))
      .orderBy(desc(aiSearchHistory.createdAt))
      .limit(30);
    res.json({
      history: history.map((entry) => {
        const context = conversationContext(entry.response);
        return {
          id: entry.id,
          conversationId: entry.conversationId,
          question: entry.question,
          intent: context.kind ?? "marketplace_discovery",
          category: context.category ?? null,
          location: context.location ?? null,
          createdAt: entry.createdAt,
        };
      }),
    });
  } catch (error) {
    req.log.error({ err: error }, "AI history lookup failed");
    res.status(500).json({ error: "AI history is temporarily unavailable" });
  }
});

router.delete("/ai/history", async (req, res) => {
  try {
    const user = await loadSession(req);
    if (!user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    const deleted = await db.delete(aiSearchHistory)
      .where(eq(aiSearchHistory.userId, user.id))
      .returning({ id: aiSearchHistory.id });
    for (const key of anonymousConversations.keys()) {
      if (key.startsWith(`${user.id}:`)) anonymousConversations.delete(key);
    }
    res.json({ deleted: deleted.length });
  } catch (error) {
    req.log.error({ err: error }, "AI history deletion failed");
    res.status(500).json({ error: "AI history could not be cleared" });
  }
});

router.get("/ai/preferences", async (req, res) => {
  try {
    const user = await loadSession(req);
    if (!user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    res.json(await loadPreferences(user.id));
  } catch (error) {
    req.log.error({ err: error }, "AI preferences lookup failed");
    res.status(500).json({ error: "AI preferences are temporarily unavailable" });
  }
});

router.put("/ai/preferences", async (req, res) => {
  const parsed = UpdateAIPreferencesBody.safeParse(req.body);
  if (!parsed.success || Object.keys(parsed.data ?? {}).length === 0) {
    res.status(400).json({ error: "Provide at least one valid preference" });
    return;
  }
  try {
    const user = await loadSession(req);
    if (!user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    const current = await loadPreferences(user.id);
    const preferredCategories = parsed.data.preferredCategories === undefined
      ? current.preferredCategories
      : Array.from(new Set(parsed.data.preferredCategories.map((value) => value.trim()).filter(Boolean))).slice(0, 12);
    const next = {
      ...current,
      ...parsed.data,
      preferredCategories,
    };
    const [saved] = await db.insert(aiPreferences)
      .values({ userId: user.id, ...next })
      .onConflictDoUpdate({
        target: aiPreferences.userId,
        set: { ...next, updatedAt: new Date() },
      })
      .returning();
    res.json(formatPreferences(saved));
  } catch (error) {
    req.log.error({ err: error }, "AI preferences update failed");
    res.status(500).json({ error: "AI preferences could not be updated" });
  }
});

export default router;