# Architecture decisions

## Phase 6 — provider-independent AI

### Keep an `AIProvider` boundary

AI interpretation stays behind a small provider interface. The provider sees a bounded query, optional prior intent, language, and input modality; it does not own marketplace database access, authentication, response contracts, or UI state. This keeps provider changes isolated and avoids coupling the product to one vendor.

### Start with a deterministic mock

Phase 6 uses a rule-based mock provider with no paid service or credential requirement. It is cheap to run, works in development without external access, and produces repeatable results for the documented examples and tests. A real provider should be added only when explicitly selected.

### Keep AI REST routes additive

Search, recommendations, suggestions, history, and preferences have separate routes. Existing marketplace endpoints remain available and are used as a visible fallback from the UI if AI search fails. Separate routes make validation, authentication, rate limiting, privacy, and later provider changes easier to review without replacing completed phases.

### Separate interpretation, listing retrieval, and ranking

The provider returns structured intent; a recommendation service retrieves eligible marketplace records and applies shared ranking; the route owns session/history/preferences. This prevents the model adapter from bypassing visibility, verification, price, or location rules and allows ranking strategies to evolve independently.

### Use user-scoped optional history

Saved AI questions and compact intent context are linked to the authenticated user, indexed by time and conversation, and capped to recent entries. Users can disable future saving or clear saved history. Exact request coordinates are not stored. Anonymous follow-up context is short-lived in-memory state rather than durable history.

### Future OpenAI and other provider strategy

Implement a new adapter for OpenAI, Gemini, Anthropic, a local LLM, or a custom model and replace the selected provider binding only after the provider is explicitly approved and configured. Keep the same intent/result contract, validation, public-listing filters, and tests. No such provider is active now.

### Future multilingual strategy

Use the request language boundary for language-aware interpretation and, if needed, a translation adapter. Preserve user-entered text and the same marketplace filters; do not infer unsupported language behavior from the English mock.

### Future image-search strategy

Add a separate image-to-query or embedding adapter behind the input/provider boundary. Keep upload validation, retention, and user consent independent from listing retrieval. Image search is not active in Phase 6.

### Future voice strategy

Convert speech to a transcript in a separate speech adapter, then pass the transcript through the existing text intent contract. Voice capture/transcription is not active in Phase 6.

### Be explicit about missing data

Do not fabricate gender, opening-hours, business/provider featured, weekly-engagement, or recently viewed data. Report unsupported filters and keep “Popular This Week” and “Recently Viewed” limitations visible until the schema has appropriate approved data.