import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let outputDirectory;
let MockAIProvider;
let createSearchSuggestions;
let rankListings;

before(async () => {
  outputDirectory = await mkdtemp(path.join(tmpdir(), "shopnear-ai-tests-"));
  await build({
    absWorkingDir: projectRoot,
    entryPoints: [
      { in: "src/lib/ai-provider.ts", out: "ai-provider" },
      { in: "src/lib/ai-ranking.ts", out: "ai-ranking" },
    ],
    outdir: outputDirectory,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
  });
  ({ MockAIProvider, createSearchSuggestions } = await import(pathToFileURL(path.join(outputDirectory, "ai-provider.js")).href));
  ({ rankListings } = await import(pathToFileURL(path.join(outputDirectory, "ai-ranking.js")).href));
});

after(async () => {
  if (outputDirectory) await rm(outputDirectory, { recursive: true, force: true });
});

const provider = () => new MockAIProvider();

test("understands nearby product intent and Naira price limits", async () => {
  const intent = await provider().analyze({ query: "Cheap iPhone near me" });
  assert.equal(intent.kind, "product_search");
  assert.equal(intent.category, "Phones & Electronics");
  assert.equal(intent.filters.nearMe, true);

  const budgetIntent = await provider().analyze({ query: "Laptop below ₦500,000" });
  assert.equal(budgetIntent.kind, "product_search");
  assert.equal(budgetIntent.filters.maxPriceCents, 50_000_000);
});

test("detects service intent, location, and verified filter", async () => {
  const tailor = await provider().analyze({ query: "Tailor in Jalingo" });
  assert.equal(tailor.kind, "service_search");
  assert.equal(tailor.category, "Tailoring");
  assert.equal(tailor.location, "Jalingo");

  const plumber = await provider().analyze({ query: "Verified plumber" });
  assert.equal(plumber.kind, "service_search");
  assert.equal(plumber.filters.verified, true);
});

test("reports unsupported filters and provides spelling corrections", async () => {
  const gender = await provider().analyze({ query: "Female makeup artist" });
  assert.equal(gender.kind, "service_search");
  assert.ok(gender.unsupportedFilters.some((value) => value.includes("gender")));

  const openNow = await provider().analyze({ query: "Electrician open now" });
  assert.equal(openNow.filters.openNow, true);
  assert.ok(openNow.unsupportedFilters.some((value) => value.toLowerCase().includes("opening hours")));

  const typo = await provider().analyze({ query: "iphnoe near me" });
  assert.equal(typo.normalizedQuery, "iphone");
  assert.equal(createSearchSuggestions("iphnoe near me", typo).correction, "iphone");
});

test("inherits query intent for follow-up price constraints", async () => {
  const mock = provider();
  const previousContext = await mock.analyze({ query: "Cheap iPhone near me" });
  const followUp = await mock.analyze({ query: "under ₦500,000", previousContext });
  assert.equal(followUp.kind, "product_search");
  assert.equal(followUp.normalizedQuery, previousContext.normalizedQuery);
  assert.equal(followUp.filters.nearMe, true);
  assert.equal(followUp.filters.maxPriceCents, 50_000_000);
});

function candidate(id, values = {}) {
  const card = {
    id,
    type: "product",
    title: id,
    description: null,
    category: "Phones & Electronics",
    location: null,
    verified: true,
    featured: false,
    rating: null,
    reviewCount: null,
    priceCents: null,
    distanceKm: null,
    href: `/products/${id}`,
    reason: "",
    createdAt: new Date(values.createdAtMs ?? 1_000).toISOString(),
    ...values.card,
  };
  return {
    card,
    popularity: values.popularity ?? 0,
    favoriteCount: 0,
    viewCount: 0,
    createdAtMs: values.createdAtMs ?? 1_000,
    matchedText: values.matchedText ?? id.toLowerCase(),
  };
}

test("supports nearby, featured, newest, verified, and category-preference ranking", () => {
  const far = candidate("far", { popularity: 20, createdAtMs: 1_000, card: { distanceKm: 20, featured: false, verified: false, category: "Fashion" } });
  const nearFeatured = candidate("near-featured", { popularity: 1, createdAtMs: 3_000, card: { distanceKm: 1, featured: true, verified: true, category: "Phones & Electronics" } });
  const recent = candidate("recent", { popularity: 1, createdAtMs: 5_000, card: { distanceKm: 10, featured: false, verified: true, category: "Home Services" } });

  assert.deepEqual(rankListings([far, nearFeatured], { nearby: true }).map(({ card }) => card.id), ["near-featured", "far"]);
  assert.deepEqual(rankListings([far, nearFeatured], { featured: true }).map(({ card }) => card.id), ["near-featured", "far"]);
  assert.deepEqual(rankListings([far, recent], { newest: true }).map(({ card }) => card.id), ["recent", "far"]);
  assert.deepEqual(rankListings([far, nearFeatured], { verified: true }).map(({ card }) => card.id), ["near-featured", "far"]);
  assert.deepEqual(rankListings([far, nearFeatured], { categoryPreferences: ["Phones"] }).map(({ card }) => card.id), ["near-featured", "far"]);
});