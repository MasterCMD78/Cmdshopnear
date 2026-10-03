import type { AIResultCard } from "./ai-recommendations";

export type RankableAIListing = {
  card: AIResultCard;
  popularity: number;
  favoriteCount: number;
  viewCount: number;
  createdAtMs: number;
  matchedText: string;
};

function matchScore(
  candidate: RankableAIListing,
  terms: string[],
  category: string | null,
  preferences: string[],
) {
  let score = 0;
  for (const term of terms) {
    if (candidate.matchedText.includes(term)) score += candidate.card.title.toLocaleLowerCase().includes(term) ? 5 : 2;
  }
  if (category && candidate.card.category?.toLocaleLowerCase().includes(category.toLocaleLowerCase())) score += 4;
  if (preferences.some((value) => candidate.card.category?.toLocaleLowerCase().includes(value.toLocaleLowerCase()))) score += 3;
  return score;
}

export function rankListings(
  items: RankableAIListing[],
  options: {
    nearby?: boolean;
    featured?: boolean;
    newest?: boolean;
    verified?: boolean;
    popularity?: boolean;
    categoryPreferences?: string[];
    searchTerms?: string[];
    category?: string | null;
  } = {},
) {
  return [...items].sort((left, right) => {
    const leftMatch = matchScore(left, options.searchTerms ?? [], options.category ?? null, options.categoryPreferences ?? []);
    const rightMatch = matchScore(right, options.searchTerms ?? [], options.category ?? null, options.categoryPreferences ?? []);
    if (rightMatch !== leftMatch) return rightMatch - leftMatch;
    if (options.nearby) {
      const leftDistance = left.card.distanceKm ?? Number.POSITIVE_INFINITY;
      const rightDistance = right.card.distanceKm ?? Number.POSITIVE_INFINITY;
      if (leftDistance !== rightDistance) return leftDistance - rightDistance;
    }
    if (options.featured && left.card.featured !== right.card.featured) return Number(right.card.featured) - Number(left.card.featured);
    if (options.verified && left.card.verified !== right.card.verified) return Number(right.card.verified) - Number(left.card.verified);
    if (options.popularity && right.popularity !== left.popularity) return right.popularity - left.popularity;
    if (options.newest && right.createdAtMs !== left.createdAtMs) return right.createdAtMs - left.createdAtMs;
    if (right.popularity !== left.popularity) return right.popularity - left.popularity;
    return right.createdAtMs - left.createdAtMs;
  });
}

export function rankRecommendationCards(
  cards: AIResultCard[],
  mode: "nearby" | "featured" | "newest" | "verified" | "popularity",
  limit = 6,
) {
  const candidates = cards.map((card): RankableAIListing => ({
    card,
    popularity: (card.reviewCount ?? 0) * 3 + (card.rating ?? 0) * 5,
    favoriteCount: 0,
    viewCount: 0,
    createdAtMs: Date.parse(card.createdAt),
    matchedText: [card.title, card.description, card.category, card.location].filter(Boolean).join(" ").toLocaleLowerCase(),
  }));
  return rankListings(candidates, {
    nearby: mode === "nearby",
    featured: mode === "featured",
    newest: mode === "newest",
    verified: mode === "verified",
    popularity: mode === "popularity",
  }).slice(0, limit).map(({ card }) => card);
}