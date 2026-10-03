import {
  and,
  desc,
  eq,
  gte,
  ilike,
  lte,
  or,
} from "drizzle-orm";
import { db } from "@workspace/db";
import {
  businesses,
  productCategories,
  products,
  serviceCategories,
  serviceProviders,
  services,
} from "@workspace/db/schema";
import {
  haversineDistanceKm,
  parseCoordinates,
  safePublicCoordinates,
  type Coordinates,
} from "./location";
import { getSearchTerms, type AISearchIntent } from "./ai-provider";
import { rankListings, type RankableAIListing } from "./ai-ranking";
export { rankListings, rankRecommendationCards } from "./ai-ranking";

export type AIResultType = "business" | "service_provider" | "product" | "service";

export type AIResultCard = {
  id: string;
  type: AIResultType;
  title: string;
  description: string | null;
  category: string | null;
  location: string | null;
  verified: boolean;
  featured: boolean;
  rating: number | null;
  reviewCount: number | null;
  priceCents: number | null;
  distanceKm: number | null;
  href: string;
  reason: string;
  createdAt: string;
};

export type AIResults = {
  businesses: AIResultCard[];
  serviceProviders: AIResultCard[];
  products: AIResultCard[];
  services: AIResultCard[];
  ranked?: AIResultCard[];
};

type SearchOptions = {
  latitude?: number;
  longitude?: number;
  radiusKm?: number;
  city?: string;
  state?: string;
  preferredCategories?: string[];
  preferredTypes?: AIResultType[];
  limit?: number;
};

type Candidate = RankableAIListing;

function likePattern(value: string) {
  return `%${value.replace(/[\\%_]/g, "\\$&")}%`;
}

function textConditions(columns: Parameters<typeof ilike>[0][], terms: string[]) {
  const conditions = terms.flatMap((term) => {
    const pattern = likePattern(term);
    return columns.map((column) => ilike(column, pattern));
  });
  return conditions.length ? or(...conditions) : undefined;
}

function hasPublicCoordinates(record: {
  latitude: string | number | null;
  longitude: string | number | null;
  locationEnabled: boolean;
  locationVisibility: string;
  verificationStatus: string;
}) {
  const safe = safePublicCoordinates(record);
  return parseCoordinates(safe.latitude, safe.longitude);
}

function getDistance(center: Coordinates | null, destination: Coordinates | null) {
  return center && destination ? haversineDistanceKm(center, destination) : null;
}

function parseRating(value: string | null | undefined) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizedText(values: (string | null | undefined)[]) {
  return values.filter(Boolean).join(" ").toLocaleLowerCase();
}

function recommendationReason(card: AIResultCard, intent: AISearchIntent, nearby: boolean) {
  if (nearby && card.distanceKm !== null) return `${card.distanceKm.toFixed(1)} km away`;
  if (card.featured) return "Featured marketplace listing";
  if (card.verified) return "Approved and verified";
  if (intent.category && card.category?.toLowerCase().includes(intent.category.toLowerCase())) return `Matches ${intent.category}`;
  return "Matched to your search";
}

export async function findAIResults(
  intent: AISearchIntent,
  options: SearchOptions = {},
): Promise<AIResults> {
  const terms = getSearchTerms(intent.normalizedQuery);
  const center = options.latitude !== undefined && options.longitude !== undefined
    ? { latitude: options.latitude, longitude: options.longitude }
    : null;
  const radiusKm = options.radiusKm ?? 25;
  const requestedLocation = options.city?.trim() || intent.location || "";
  const termsForDB = terms.length ? terms : intent.category ? [intent.category.toLowerCase()] : [];
  const cityPattern = requestedLocation ? likePattern(requestedLocation) : undefined;
  const statePattern = options.state?.trim() ? likePattern(options.state.trim()) : undefined;
  const minPrice = intent.filters.minPriceCents;
  const maxPrice = intent.filters.maxPriceCents;
  const [businessRows, providerRows, productRows, serviceRows] = await Promise.all([
    db.select().from(businesses).where(and(
      eq(businesses.verificationStatus, "approved"),
      textConditions([businesses.businessName, businesses.category, businesses.description], termsForDB),
      cityPattern ? ilike(businesses.businessAddress, cityPattern) : undefined,
      statePattern ? ilike(businesses.businessAddress, statePattern) : undefined,
    )).orderBy(desc(businesses.createdAt)).limit(120),
    db.select().from(serviceProviders).where(and(
      eq(serviceProviders.verificationStatus, "approved"),
      textConditions([serviceProviders.profession, serviceProviders.location], termsForDB),
      cityPattern ? ilike(serviceProviders.location, cityPattern) : undefined,
      statePattern ? ilike(serviceProviders.location, statePattern) : undefined,
    )).orderBy(desc(serviceProviders.createdAt)).limit(120),
    db.select({ listing: products, business: businesses, category: productCategories.name })
      .from(products)
      .innerJoin(businesses, eq(products.businessId, businesses.id))
      .leftJoin(productCategories, eq(products.categoryId, productCategories.id))
      .where(and(
        eq(products.status, "published"),
        eq(products.isVisible, true),
        eq(products.isAvailable, true),
        eq(businesses.verificationStatus, "approved"),
        intent.filters.featured ? eq(products.isFeatured, true) : undefined,
        minPrice !== null && minPrice !== undefined ? gte(products.priceCents, minPrice) : undefined,
        maxPrice !== null && maxPrice !== undefined ? lte(products.priceCents, maxPrice) : undefined,
        textConditions([products.name, products.description, products.brand, products.location, productCategories.name], termsForDB),
        cityPattern ? or(ilike(products.location, cityPattern), ilike(businesses.businessAddress, cityPattern)) : undefined,
        statePattern ? or(ilike(products.location, statePattern), ilike(businesses.businessAddress, statePattern)) : undefined,
      )).orderBy(desc(products.createdAt)).limit(120),
    db.select({ listing: services, business: businesses, provider: serviceProviders, category: serviceCategories.name })
      .from(services)
      .leftJoin(businesses, eq(services.businessId, businesses.id))
      .leftJoin(serviceProviders, eq(services.providerId, serviceProviders.id))
      .leftJoin(serviceCategories, eq(services.categoryId, serviceCategories.id))
      .where(and(
        eq(services.status, "published"),
        eq(services.isVisible, true),
        eq(services.isAvailable, true),
        or(eq(businesses.verificationStatus, "approved"), eq(serviceProviders.verificationStatus, "approved")),
        intent.filters.featured ? eq(services.isFeatured, true) : undefined,
        minPrice !== null && minPrice !== undefined ? gte(services.priceFromCents, minPrice) : undefined,
        maxPrice !== null && maxPrice !== undefined ? lte(services.priceFromCents, maxPrice) : undefined,
        textConditions([services.name, services.description, services.location, serviceCategories.name], termsForDB),
        cityPattern ? or(ilike(services.location, cityPattern), ilike(businesses.businessAddress, cityPattern), ilike(serviceProviders.location, cityPattern)) : undefined,
        statePattern ? or(ilike(services.location, statePattern), ilike(businesses.businessAddress, statePattern), ilike(serviceProviders.location, statePattern)) : undefined,
      )).orderBy(desc(services.createdAt)).limit(120),
  ]);

  const candidates: Candidate[] = [];
  for (const business of businessRows) {
    const coords = hasPublicCoordinates(business);
    const distanceKm = getDistance(center, coords);
    const card: AIResultCard = {
      id: business.id,
      type: "business",
      title: business.businessName,
      description: business.description,
      category: business.category,
      location: business.businessAddress,
      verified: true,
      featured: false,
      rating: parseRating(business.averageRating),
      reviewCount: business.totalReviews,
      priceCents: null,
      distanceKm,
      href: `/businesses/${business.id}`,
      reason: "",
      createdAt: business.createdAt.toISOString(),
    };
    candidates.push({
      card,
      popularity: (business.totalReviews ?? 0) * 3 + (parseRating(business.averageRating) ?? 0) * 5,
      favoriteCount: 0,
      viewCount: 0,
      createdAtMs: business.createdAt.getTime(),
      matchedText: normalizedText([business.businessName, business.category, business.description, business.businessAddress]),
    });
  }

  for (const provider of providerRows) {
    const coords = hasPublicCoordinates(provider);
    const distanceKm = getDistance(center, coords);
    const card: AIResultCard = {
      id: provider.id,
      type: "service_provider",
      title: provider.profession,
      description: provider.experience,
      category: "Services",
      location: provider.location,
      verified: true,
      featured: false,
      rating: null,
      reviewCount: null,
      priceCents: null,
      distanceKm,
      href: `/search?q=${encodeURIComponent(provider.profession)}`,
      reason: "",
      createdAt: provider.createdAt.toISOString(),
    };
    candidates.push({
      card,
      popularity: Array.isArray(provider.skills) ? provider.skills.length : 0,
      favoriteCount: 0,
      viewCount: 0,
      createdAtMs: provider.createdAt.getTime(),
      matchedText: normalizedText([provider.profession, provider.location, ...(Array.isArray(provider.skills) ? provider.skills : [])]),
    });
  }

  for (const { listing, business, category } of productRows) {
    const coords = hasPublicCoordinates(business);
    const distanceKm = getDistance(center, coords);
    const card: AIResultCard = {
      id: listing.id,
      type: "product",
      title: listing.name,
      description: listing.description,
      category: category ?? "Products",
      location: listing.location || business.businessAddress,
      verified: true,
      featured: listing.isFeatured,
      rating: null,
      reviewCount: null,
      priceCents: listing.priceCents,
      distanceKm,
      href: `/products/${listing.id}`,
      reason: "",
      createdAt: listing.createdAt.toISOString(),
    };
    candidates.push({
      card,
      popularity: listing.favoriteCount * 3 + listing.viewCount,
      favoriteCount: listing.favoriteCount,
      viewCount: listing.viewCount,
      createdAtMs: listing.createdAt.getTime(),
      matchedText: normalizedText([listing.name, listing.description, listing.brand, listing.location, category, ...(Array.isArray(listing.tags) ? listing.tags : [])]),
    });
  }

  for (const { listing, business, provider, category } of serviceRows) {
    const approvedBusiness = business?.verificationStatus === "approved" ? business : null;
    const approvedProvider = provider?.verificationStatus === "approved" ? provider : null;
    const coords = approvedBusiness
      ? hasPublicCoordinates(approvedBusiness)
      : approvedProvider
        ? hasPublicCoordinates(approvedProvider)
        : null;
    const distanceKm = getDistance(center, coords);
    const providerLocation = approvedProvider?.location ?? null;
    const card: AIResultCard = {
      id: listing.id,
      type: "service",
      title: listing.name,
      description: listing.description,
      category: category ?? "Services",
      location: listing.location || approvedBusiness?.businessAddress || providerLocation,
      verified: Boolean(approvedBusiness || approvedProvider),
      featured: listing.isFeatured,
      rating: null,
      reviewCount: null,
      priceCents: listing.priceFromCents,
      distanceKm,
      href: `/services/${listing.id}`,
      reason: "",
      createdAt: listing.createdAt.toISOString(),
    };
    candidates.push({
      card,
      popularity: listing.favoriteCount * 3 + listing.viewCount,
      favoriteCount: listing.favoriteCount,
      viewCount: listing.viewCount,
      createdAtMs: listing.createdAt.getTime(),
      matchedText: normalizedText([listing.name, listing.description, listing.location, providerLocation, category, ...(Array.isArray(listing.tags) ? listing.tags : [])]),
    });
  }

  const locationRequested = Boolean(center || requestedLocation || options.state?.trim());
  const withinRadius = (candidate: Candidate) => {
    if (!center || !locationRequested) return true;
    return candidate.card.distanceKm !== null && candidate.card.distanceKm <= radiusKm;
  };
  const relevant = candidates.filter((candidate) => {
    if (!withinRadius(candidate)) return false;
    if (intent.filters.featured && ["business", "service_provider"].includes(candidate.card.type)) return false;
    if (intent.kind === "business_search" && candidate.card.type !== "business") return false;
    if (intent.kind === "product_search" && candidate.card.type !== "product") return false;
    if (intent.kind === "service_search" && !["service", "service_provider"].includes(candidate.card.type)) return false;
    return true;
  });
  const ranked = rankListings(relevant, {
    nearby: Boolean(center),
    featured: intent.filters.featured,
    newest: intent.filters.newest,
    verified: intent.filters.verified,
    popularity: !intent.normalizedQuery,
    categoryPreferences: options.preferredCategories,
    searchTerms: terms,
    category: intent.category,
  }).slice(0, options.limit ?? 16);
  const reasoned = ranked.map((candidate) => ({
    ...candidate.card,
    reason: recommendationReason(candidate.card, intent, Boolean(center)),
  }));
  return {
    businesses: reasoned.filter((item) => item.type === "business"),
    serviceProviders: reasoned.filter((item) => item.type === "service_provider"),
    products: reasoned.filter((item) => item.type === "product"),
    services: reasoned.filter((item) => item.type === "service"),
    ranked: reasoned,
  };
}

export function flattenAIResults(results: AIResults) {
  return results.ranked ?? [
    ...results.businesses,
    ...results.serviceProviders,
    ...results.products,
    ...results.services,
  ];
}
