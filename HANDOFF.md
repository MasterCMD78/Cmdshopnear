# ShopNear Handoff

## Current Phase

Phase 6 — ShopNear AI (complete). Phases 1–5 remain complete; Phase 7 has not started.

## Last Completed Task

Completed Phase 6 with a provider-independent mock AI assistant, natural-language marketplace search, public-listing recommendations, suggestions, conversation context, and per-user preferences/history.

## Database Migrations Applied

- Phase 5 added location metadata to the existing `users`, `businesses`, and `service_providers` tables through the development-only Drizzle push. No tables were recreated.
- Phase 6 added only `ai_preferences`, `ai_search_history`, and their foreign keys/indexes. Verification confirmed no existing tables were altered and no data was removed.
- Drizzle push is the project's existing schema reconciliation workflow; there is no committed migration directory.

## API Endpoints Added

Phase 5:

- `GET|PUT /api/location`
- `PUT /api/businesses/:id/location`
- `PUT /api/service-providers/:id/location`
- `GET /api/marketplace/nearby`
- Extended `GET /api/marketplace/search` with location and discovery filters

Phase 6:

- `POST /api/ai/search`
- `GET /api/ai/recommendations`
- `GET /api/ai/suggestions`
- `GET|DELETE /api/ai/history`
- `GET|PUT /api/ai/preferences`

## Files Modified

- API and tests: `artifacts/api-server/package.json`, `artifacts/api-server/src/lib/ai-provider.ts`, `artifacts/api-server/src/lib/ai-ranking.ts`, `artifacts/api-server/src/lib/ai-recommendations.ts`, `artifacts/api-server/src/routes/ai.ts`, `artifacts/api-server/src/routes/index.ts`, and `artifacts/api-server/test/ai.test.mjs`
- Database: `lib/db/src/schema/ai.ts` and `lib/db/src/schema/index.ts`
- API contract/codegen: `lib/api-spec/openapi.yaml`, `lib/api-client-react/src/generated/api.ts`, `lib/api-client-react/src/generated/api.schemas.ts`, `lib/api-zod/src/generated/api.ts`, and the generated AI type/parameter files under `lib/api-zod/src/generated/types/`
- Existing ShopNear UI/client: `artifacts/shopnear/src/App.tsx`, `artifacts/shopnear/src/components/ai-marketplace.tsx`, and `artifacts/shopnear/src/lib/auth-api.ts`
- Documentation: `docs/README.md`, `docs/API.md`, `docs/DATABASE.md`, `docs/ARCHITECTURE.md`, `docs/AI.md`, `docs/SECURITY.md`, `docs/ROADMAP.md`, `docs/CHANGELOG.md`, `docs/DECISIONS.md`, `replit.md`, `PROJECT_MEMORY.md`, and `HANDOFF.md`

## Verification Results

- `pnpm build` passed, including workspace typechecks and API, ShopNear, and mockup production builds. Vite emitted a non-fatal sourcemap warning for the existing tooltip component.
- `pnpm --filter @workspace/api-server test` passed all 5 AI parser/ranking tests.
- The development schema push added only the two AI tables and their foreign keys/indexes.
- API smoke checks passed for search, suggestions, recommendations, coordinate validation/privacy, and unauthenticated history/preferences access. Search explicitly reports when “near me” lacks coordinates or featured filtering omits business/provider profiles.
- All three configured workflows are running; the API workflow was restarted after the final route change.
- Mobile Home and desktop Search rendered. The browser's 401 was the expected unauthenticated `GET /api/auth/session`, which the client treats as signed out. The signed-in Profile controls were not visually verified because the preview browser has no session.
- No public listings are seeded, so discovery pages show the expected empty states.

## Known Limitations

- The mock provider supports English text only; no external AI provider or credentials are active.
- Provider gender is not public data, and opening hours are not normalized enough to support “open now.”
- Weekly popularity is approximated from recent listing dates and lifetime engagement totals. Recently viewed remains unavailable until a privacy-reviewed visit event exists.
- Business/provider profiles do not have a featured flag.
- Customer GPS is request-scoped and private; public business/provider coordinates require owner opt-in and approval.
- No map/routing vendor is configured. Straight-line distance works; road distance and travel time remain `null`.
- There is no committed demo/seed data. App Storage upload signing remains limited by the runtime authorization issue documented elsewhere.

## Environment Requirements

- `DATABASE_URL` is required for API and database operations.
- `SESSION_SECRET` is required for authenticated session signing.
- Use the configured pnpm workspace workflows for the web app, API server, and mockup sandbox.

## Exact Next Task

There is no remaining Phase 6 implementation. Do not begin Phase 7 without explicit approval. Once approved, use the Phase 7 roadmap and official specifications to scope Chat and Notifications first, followed by Reviews and Ratings; keep the work additive and preserve completed phases.

## Next Prompt Context

Phase 6 is complete. Keep AI provider-independent, retain public-listing eligibility, never persist customer GPS coordinates, and do not start Phase 7 or alter completed phases without explicit approval.