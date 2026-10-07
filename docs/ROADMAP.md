# Roadmap

## Completed

- Phase 1: responsive marketplace UI and ShopNear navigation
- Phase 2: authentication and account foundation
- Phase 2 finalization audit: Neon verification, role/account smoke coverage, response compatibility fix, and documentation
- Phase 3 foundation: persistent products/services, owner-scoped CRUD, availability/visibility controls, categories, catalog, and business metrics
- Phase 3 follow-through: richer listing fields, featured/trending/newest discovery, marketplace search, category administration API, expanded dashboard metrics, OpenAPI synchronization, and verification
- Phase 4: persistent favorites, public business/product/service details, related listings, API-backed home/search discovery, loading/empty states, and verification badges
- Phase 5: opt-in location and permission controls, provider-neutral map/routing boundary, nearby business/product/service discovery, distance/radius filtering, city/state and verified/featured/newest filters, OpenAPI synchronization, and verification
- Phase 6: provider-independent AI search, recommendations, suggestions, saved history, and preferences
- Phase 7: chat, notifications, reviews, ratings, moderation, persistent blocks, and paginated favorites
- Phase 8: administrator operations, verification, user/report/content moderation, analytics, future-ready settings, audit history, and granular roles
- Phase 9: API security hardening, OTP/session robustness, dependency remediation, private-object safeguards, and accessibility improvements

## Next

- Phase 10: production release

## Phase 2 follow-up hardening

- Resolve App Storage runtime resource authorization and rerun authenticated upload verification.
- Replace the local OTP provider with production SMS delivery before release.
- Add repeatable committed database migrations if schema history becomes a release requirement.

## Phase 5 follow-up

- Select a concrete map/routing provider before enabling map-pin selection and road travel estimates; straight-line distances work without one.

## Phase 6 status

- Complete: provider-independent mock AI, natural-language marketplace search, intent and category detection, suggestions, corrections, recommendations, conversation context, user preferences, saved-history controls, API contracts, and documentation.

## Phase 7 status

- Complete: participant-scoped chat, read receipts, typing state, persistent blocks, reports, authenticated live updates, notification history/preferences, customer reviews, rating summaries, moderation UI, and paginated favorites.

## Phase 8 status

- Complete: administrator dashboard, business/provider verification, account management, reports, moderation, analytics, future-ready platform configuration, audit logs, category management, and role administration. No Phase 8 schema migration was required.

## Phase 9 status

- Complete: same-origin mutation checks, response security headers, bounded request parsing, generic API errors, validated session claims, atomic OTP consumption, bounded rate-limit state, safe private image retrieval, patched dependency graph, improved keyboard/zoom/reduced-motion support, stronger text contrast, and accurate page metadata.
- No database schema change or push was needed. Production shared rate limiting, byte-bound upload signing, and authenticated App Storage verification remain explicit follow-up work.
- Phase 10 has not started.

## Future AI improvements

- Add a real model adapter only when a provider and credentials are explicitly selected; keep the mock provider available for local and deterministic testing.
- Add structured opening-hours and public demographic fields only after the product and privacy requirements are defined.
- Add event-level view/favorite analytics before claiming true week-over-week popularity, and add a privacy-reviewed view event before implementing recently viewed.
- Add translation, voice transcription, or image embeddings behind the provider/input adapters when those capabilities are in scope.