export type AIIntentKind =
  | "marketplace_discovery"
  | "business_search"
  | "product_search"
  | "service_search";

export type AISearchIntent = {
  kind: AIIntentKind;
  normalizedQuery: string;
  category: string | null;
  location: string | null;
  confidence: number;
  filters: {
    nearMe: boolean;
    verified: boolean;
    featured: boolean;
    newest: boolean;
    openNow: boolean;
    minPriceCents: number | null;
    maxPriceCents: number | null;
  };
  unsupportedFilters: string[];
};

export type AIConversationContext = Partial<Pick<
  AISearchIntent,
  "kind" | "normalizedQuery" | "category" | "location" | "filters"
>> & { unsupportedFilters?: string[] };

export type AIProviderInput = {
  query: string;
  previousContext?: AIConversationContext | null;
  language?: string;
  modality?: "text" | "voice-transcript" | "image";
};

export interface AIProvider {
  readonly name: string;
  analyze(input: AIProviderInput): Promise<AISearchIntent>;
}

const categoryRules: { label: string; kind: AIIntentKind; terms: string[] }[] = [
  { label: "Phones & Electronics", kind: "product_search", terms: ["iphone", "android", "phone", "smartphone", "samsung", "laptop", "computer", "tablet", "electronics", "macbook"] },
  { label: "Tailoring", kind: "service_search", terms: ["tailor", "tailoring"] },
  { label: "Fashion", kind: "product_search", terms: ["fashion", "clothes", "clothing", "shoes", "hijab", "dress"] },
  { label: "Food & Restaurants", kind: "business_search", terms: ["restaurant", "cafe", "coffee", "catering", "caterer", "food", "groceries", "supermarket"] },
  { label: "Beauty", kind: "service_search", terms: ["makeup", "makeup artist", "hair", "barber", "salon", "beauty", "nails", "stylist"] },
  { label: "Home Services", kind: "service_search", terms: ["electrician", "plumber", "plumbing", "mechanic", "repair", "repairs", "cleaner", "cleaning", "generator", "carpenter"] },
  { label: "Health", kind: "business_search", terms: ["doctor", "clinic", "pharmacy", "health", "dentist"] },
  { label: "Events", kind: "service_search", terms: ["photographer", "photography", "wedding", "event", "caterer", "catering"] },
  { label: "Vehicles", kind: "business_search", terms: ["vehicle", "car", "auto", "mechanic", "tyre", "tire"] },
];

const fillerWords = new Set([
  "a", "an", "and", "any", "around", "at", "best", "buy", "can", "cheap", "cheapest",
  "find", "for", "good", "help", "i", "in", "looking", "me", "my", "near", "need",
  "of", "please", "the", "to", "want", "where", "with", "shop", "shops", "business",
  "businesses", "product", "products", "service", "services", "open", "now", "verified",
  "featured", "new", "newest", "under", "below", "less", "than", "up", "within", "over",
  "above", "more", "expensive", "female", "male", "woman", "women", "man", "men",
]);

const knownTerms = Array.from(new Set(categoryRules.flatMap((rule) => rule.terms)));

function cleanQuery(value: string) {
  return value
    .replace(/\b(?:under|below|less than|up to|within|max(?:imum)?|over|above|more than)\s*(?:₦|NGN|N)?\s*[\d,.]+\s*(?:k|m)?\b/gi, " ")
    .replace(/\b(?:in|near|around)\s+(?!me\b)([\p{L}][\p{L} .'-]{1,40}?)(?=\s+(?:under|below|less|open|verified|featured|nearby|best|cheap|cheapest)\b|[?.!,]|$)/giu, " ")
    .replace(/\b(?:near me|nearby|around me|open now|verified|featured|newest|cheapest|cheaper|cheap|best|female|male|woman|women|man|men)\b/gi, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter((word) => word && !fillerWords.has(word.toLowerCase()))
    .join(" ");
}

function extractLocation(value: string): string | null {
  const match = value.match(/\b(?:in|near|around)\s+(?!me\b)([\p{L}][\p{L} .'-]{1,40}?)(?=\s+(?:under|below|less|open|verified|featured|nearby|best|cheap|cheapest)\b|[?.!,]|$)/iu);
  return match?.[1]?.trim().replace(/\s+/g, " ") || null;
}

function extractPrice(value: string, direction: "min" | "max"): number | null {
  const pattern = direction === "max"
    ? /\b(?:under|below|less than|up to|within|max(?:imum)?)\s*(?:₦|NGN|N|\$)?\s*([\d,.]+)\s*(k|m)?/i
    : /\b(?:over|above|more than|at least|min(?:imum)?)\s*(?:₦|NGN|N|\$)?\s*([\d,.]+)\s*(k|m)?/i;
  const match = value.match(pattern);
  if (!match) return null;
  const amount = Number(match[1].replaceAll(",", ""));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const scale = match[2]?.toLowerCase() === "m" ? 1_000_000 : match[2]?.toLowerCase() === "k" ? 1_000 : 1;
  return Math.round(amount * scale * 100);
}

function categoryMatch(query: string) {
  const normalized = query.toLowerCase();
  return categoryRules.find((rule) => rule.terms.some((term) => normalized.includes(term))) ?? null;
}

function inferKind(query: string): AIIntentKind {
  const rule = categoryMatch(query);
  if (rule) return rule.kind;
  if (/\b(?:business|store|shop|restaurant|market|salon)\b/i.test(query)) return "business_search";
  return "marketplace_discovery";
}

function levenshtein(left: string, right: string): number {
  const rows = Array.from(
    { length: left.length + 1 },
    () => Array<number>(right.length + 1).fill(0),
  );
  for (let row = 0; row <= left.length; row += 1) rows[row][0] = row;
  for (let column = 0; column <= right.length; column += 1) rows[0][column] = column;
  for (let row = 1; row <= left.length; row += 1) {
    for (let column = 1; column <= right.length; column += 1) {
      let distance = Math.min(
        rows[row - 1][column] + 1,
        rows[row][column - 1] + 1,
        rows[row - 1][column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1),
      );
      if (
        row > 1
        && column > 1
        && left[row - 1] === right[column - 2]
        && left[row - 2] === right[column - 1]
      ) {
        distance = Math.min(distance, rows[row - 2][column - 2] + 1);
      }
      rows[row][column] = distance;
    }
  }
  return rows[left.length][right.length];
}

export function correctSearchTerms(query: string): string | null {
  const words = query.split(/\s+/).filter(Boolean);
  let changed = false;
  const corrected = words.map((word) => {
    const normalized = word.toLowerCase();
    if (knownTerms.includes(normalized)) return word;
    const match = knownTerms
      .map((term) => ({ term, distance: levenshtein(normalized, term) }))
      .filter(({ term, distance }) => distance <= (normalized.length >= 7 ? 2 : 1) && distance > 0)
      .sort((a, b) => a.distance - b.distance || a.term.length - b.term.length)[0];
    if (!match) return word;
    changed = true;
    return match.term;
  });
  return changed ? corrected.join(" ") : null;
}

export function getSearchTerms(query: string): string[] {
  const baseTerms = query.toLowerCase().split(/\s+/).filter((term) => term.length > 1);
  const expansions: Record<string, string[]> = {
    electrician: ["electrical", "electric"],
    plumber: ["plumbing"],
    tailor: ["tailoring"],
    mechanic: ["auto repair"],
    iphone: ["apple", "phone"],
    laptop: ["computer"],
    makeup: ["beauty"],
    caterer: ["catering"],
  };
  return Array.from(new Set(baseTerms.flatMap((term) => [term, ...(expansions[term] ?? [])]))).slice(0, 12);
}

export function createSearchSuggestions(query: string, intent: AISearchIntent) {
  const correction = correctSearchTerms(cleanQuery(query));
  const base = intent.normalizedQuery || intent.category?.toLowerCase() || "local businesses";
  const nextSearches = [
    `${base} near me`,
    `verified ${base}`,
    ...(intent.category ? [`${intent.category.toLowerCase()} nearby`] : []),
  ];
  return {
    correction,
    relatedSearches: Array.from(new Set([
      ...(correction ? [correction] : []),
      ...nextSearches,
    ])).slice(0, 5),
    suggestedNextSearches: nextSearches.slice(0, 4),
    suggestedCategories: intent.category
      ? [intent.category, ...categoryRules.filter((rule) => rule.label !== intent.category).slice(0, 2).map((rule) => rule.label)]
      : categoryRules.slice(0, 4).map((rule) => rule.label),
  };
}

export class MockAIProvider implements AIProvider {
  readonly name = "mock";

  async analyze(input: AIProviderInput): Promise<AISearchIntent> {
    const rawQuery = input.query.trim();
    const previous = input.previousContext;
    const extractedLocation = extractLocation(rawQuery);
    const cleaned = cleanQuery(rawQuery);
    const corrected = correctSearchTerms(cleaned);
    const normalizedQuery = cleaned.length === 0 && previous?.normalizedQuery
      ? previous.normalizedQuery
      : corrected ?? cleaned;
    const match = categoryMatch(`${rawQuery} ${normalizedQuery}`);
    const isFollowUp = cleaned.length === 0 && previous?.kind;
    const hasNearIntent = /\b(?:near me|nearby|around me)\b/i.test(rawQuery);
    const openNow = /\bopen now\b/i.test(rawQuery);
    const verified = /\bverified\b/i.test(rawQuery);
    const featured = /\bfeatured\b/i.test(rawQuery);
    const newest = /\b(?:new|newest|latest)\b/i.test(rawQuery);
    const genderRequested = /\b(?:female|woman|women|male|man|men)\b/i.test(rawQuery);
    const inheritedUnsupported = isFollowUp ? previous?.unsupportedFilters ?? [] : [];
    const unsupportedFilters = [
      ...(openNow || (isFollowUp && previous?.filters?.openNow) ? ["Opening hours are not consistently structured yet, so open-now results cannot be confirmed."] : []),
      ...(genderRequested ? ["Public listings do not expose provider gender, so results are not filtered by gender."] : inheritedUnsupported),
      ...(featured ? ["Only product and service listings have a featured flag; business and provider profiles cannot be filtered as featured."] : []),
    ];
    const minPriceCents = extractPrice(rawQuery, "min") ?? (isFollowUp ? previous?.filters?.minPriceCents ?? null : null);
    const maxPriceCents = extractPrice(rawQuery, "max") ?? (isFollowUp ? previous?.filters?.maxPriceCents ?? null : null);
    const kind = match?.kind ?? (isFollowUp ? previous?.kind : undefined) ?? inferKind(rawQuery);
    const category = match?.label ?? (isFollowUp ? previous?.category ?? null : null);
    const location = extractedLocation ?? (isFollowUp ? previous?.location ?? null : null);
    const knownIntent = Boolean(match || normalizedQuery || location || hasNearIntent || verified || featured || newest);
    return {
      kind,
      normalizedQuery,
      category,
      location,
      confidence: knownIntent ? (match ? 0.94 : 0.76) : 0.35,
      filters: {
        nearMe: hasNearIntent || (isFollowUp ? previous?.filters?.nearMe ?? false : false),
        verified: verified || (isFollowUp ? previous?.filters?.verified ?? false : false),
        featured: featured || (isFollowUp ? previous?.filters?.featured ?? false : false),
        newest: newest || (isFollowUp ? previous?.filters?.newest ?? false : false),
        openNow: openNow || (isFollowUp ? previous?.filters?.openNow ?? false : false),
        minPriceCents,
        maxPriceCents,
      },
      unsupportedFilters,
    };
  }
}

export const aiProvider: AIProvider = new MockAIProvider();