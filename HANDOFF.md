# ShopNear Handoff

## Current Phase

Phase 7 — Chat, Notifications, Reviews & Ratings (complete). Phases 1–6 remain complete; Phase 8 has not started.

## Last Completed Task

Completed Phase 7 by adding participant-scoped messaging, notifications, reviews, ratings, moderation, and paginated favorites without rebuilding completed phases or removing data.

## Database Migrations Applied

- Phase 5 added location metadata to the existing `users`, `businesses`, and `service_providers` tables through the development-only Drizzle push. No tables were recreated.
- Phase 6 added only `ai_preferences`, `ai_search_history`, and their foreign keys/indexes. Verification confirmed no existing tables were altered and no data was removed.
- Phase 7 added only engagement tables and review storage through the documented non-force development Drizzle push; existing tables and data were preserved.
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

Phase 7:

- `/api/chat/*` — conversations, messages, read/typing state, reports, persistent blocks, and authenticated SSE
- `/api/notifications/*` — paginated history, unread/read state, preferences, and admin announcements
- `/api/reviews`, `/api/ratings/*`, and `/api/admin/*` — customer reviews, public rating summaries, and moderator queues/actions
- `GET /api/favorites?page=&limit=` — paginated listing favorites

## Files Modified

- API and tests: `artifacts/api-server/package.json`, `artifacts/api-server/src/lib/ai-provider.ts`, `artifacts/api-server/src/lib/ai-ranking.ts`, `artifacts/api-server/src/lib/ai-recommendations.ts`, `artifacts/api-server/src/routes/ai.ts`, `artifacts/api-server/src/routes/index.ts`, and `artifacts/api-server/test/ai.test.mjs`
- Database: `lib/db/src/schema/ai.ts` and `lib/db/src/schema/index.ts`
- API contract/codegen: `lib/api-spec/openapi.yaml`, `lib/api-client-react/src/generated/api.ts`, `lib/api-client-react/src/generated/api.schemas.ts`, `lib/api-zod/src/generated/api.ts`, and the generated AI type/parameter files under `lib/api-zod/src/generated/types/`
- Existing ShopNear UI/client: `artifacts/shopnear/src/App.tsx`, `artifacts/shopnear/src/components/ai-marketplace.tsx`, and `artifacts/shopnear/src/lib/auth-api.ts`
- Phase 7 API/schema/UI: `artifacts/api-server/src/routes/chat.ts`, `artifacts/api-server/src/routes/notifications.ts`, `artifacts/api-server/src/routes/reviews.ts`, `lib/db/src/schema/engagement.ts`, `lib/api-spec/openapi.yaml`, `artifacts/shopnear/src/phase7.tsx`, and `artifacts/shopnear/src/App.tsx`
- Documentation: `docs/README.md`, `docs/API.md`, `docs/DATABASE.md`, `docs/ARCHITECTURE.md`, `docs/AI.md`, `docs/SECURITY.md`, `docs/ROADMAP.md`, `docs/CHANGELOG.md`, `docs/DECISIONS.md`, `replit.md`, `PROJECT_MEMORY.md`, and `HANDOFF.md`

## Verification Results

- `pnpm build` passed, including workspace typechecks and API, ShopNear, and mockup production builds. Vite emitted a non-fatal sourcemap warning for the existing tooltip component.
- `pnpm --filter @workspace/api-server test` passed all 5 AI parser/ranking tests.
- The development schema push added only the two AI tables and their foreign keys/indexes.
- API smoke checks passed for search, suggestions, recommendations, coordinate validation/privacy, and unauthenticated history/preferences access. Search explicitly reports when “near me” lacks coordinates or featured filtering omits business/provider profiles.
- All three configured workflows are running; the API workflow was restarted after the final route change.
- Mobile Home and desktop Search rendered. The browser's 401 was the expected unauthenticated `GET /api/auth/session`, which the client treats as signed out. The signed-in Profile controls were not visually verified because the preview browser has no session.
- No public listings are seeded, so discovery pages show the expected empty states.
- Phase 7: OpenAPI codegen and workspace typechecks passed; `pnpm --filter @workspace/api-server test` passed all 5 existing AI parser/ranking tests; `pnpm build` passed with the existing non-fatal tooltip sourcemap warning.
- Phase 7: the non-force development schema push succeeded. Database metadata confirms the new chat, block, report, notification, and review tables; the existing favorites columns (`id`, `user_id`, `entity_type`, `entity_id`, `created_at`) remain unchanged.
- Phase 7: health endpoint returned 200; protected chat, notification, review, and admin routes returned the expected 401 without a session. A rating lookup for a nonexistent listing returned the expected 404.
- Phase 7: all configured workflows restarted successfully. The mobile `/messages` preview rendered its signed-out state; authenticated screens and interactions were not visually verified because the preview browser has no session.

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

Phase 7 is complete. Do not begin Phase 8 without explicit approval. Keep any follow-up work within the agreed Phase 7 scope unless the user authorizes a new phase.

## Next Prompt Context

Phase 7 is complete. Preserve the existing ShopNear design, five-tab navigation, database records, and session boundary. Do not start Phase 8 without explicit approval.