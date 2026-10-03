# AI

ShopNear AI remains a core discovery feature. Phase 2 does not change AI behavior or prompt logic.

Authenticated users are associated with their saved AI history and role. Future AI business-assistant features can use the same authenticated user and business ownership boundaries without changing the session model.

The Phase 2 audit did not add, remove, or rewrite AI prompts, recommendations, or model integrations. AI-related behavior remains outside the verified Phase 2 changes.

Phase 4 keeps the existing ShopNear AI search entry point and routes its submitted terms into the API-backed marketplace search surface. No new model integration or prompt behavior was introduced.

Phase 5 exposes opt-in nearby search and manual city/state filters to existing discovery surfaces. Any future AI recommendations should consume public, approved business/provider results and must not expose a customer's private coordinates.

## Phase 6: provider-independent ShopNear AI

The first provider is a deterministic mock implementation. It does not call a paid model or require provider credentials. `AIProvider` accepts query text, language, modality, and optional prior intent, keeping provider choice separate from database lookup, REST contracts, and UI behavior.

Natural-language search detects marketplace intent, category, city, price bounds, nearby/verified/featured/newest filters, and common spelling errors. It returns only approved public listings, with explanation text, intent confidence, supported filters, unsupported-filter notes, suggested categories, related searches, and next searches. Follow-up constraints inherit the previous search intent for the same user-scoped conversation. Anonymous conversation context is short-lived and held in process memory.

Recommendation ranking combines query/category relevance, explicit category preferences, public distance, listing recency, featured status, verification, ratings, views, and favorites where those signals exist. Existing storage has lifetime engagement totals rather than week-scoped events, so “Popular This Week” is approximated with recent listings and available lifetime signals. Recently viewed is a clear empty state until privacy-reviewed visit tracking exists.

Current boundaries: English text only; no external model calls; provider gender is not public data; opening-hours data is not normalized enough to confirm “open now”; business/provider profiles have no featured field; anonymous history is not persisted. Unsupported filters are disclosed. User history is optional and clearable; request GPS coordinates are never persisted.

Future OpenAI, Gemini, Anthropic, or local-model integrations should implement the same provider interface and be selected behind the adapter, without changing route schemas or marketplace result eligibility. Multilingual support should add language-aware parsing/translation; voice should pass a transcript through text interpretation; image search should add an image-to-query/embedding adapter. None of these integrations is active in Phase 6.