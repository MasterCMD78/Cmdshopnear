# ShopNear Handoff

## Current Phase

Phase 8 — Administration & Moderation (complete). Phases 1–7 remain complete; Phase 9 has not started.

## Last Completed Task

Completed and verified Phase 8 administrator operations while preserving the existing ShopNear architecture, completed phases, database records, and customer-facing design.

## Database Migrations Applied

- Phase 5 added location metadata to the existing `users`, `businesses`, and `service_providers` tables through the development-only Drizzle push. No tables were recreated.
- Phase 6 added only `ai_preferences`, `ai_search_history`, and their foreign keys/indexes. Verification confirmed no existing tables were altered and no data was removed.
- Phase 7 added only engagement tables and review storage through the documented non-force development Drizzle push; existing tables and data were preserved.
- Drizzle push is the project's existing schema reconciliation workflow; there is no committed migration directory.
- Phase 8 made no schema changes and ran no push. Read-only development inspection confirmed all existing admin, verification, analytics, audit, settings, and category tables; settings remain in the existing `app_settings.value` JSONB field.

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

Phase 8 administrator surface (all routes below are under `/api`):

- `GET /admin/access`, `POST /admin/roles/bootstrap`, `GET /admin/roles`, and `PUT|DELETE /admin/roles/:userId`
- `GET /admin/dashboard`, `GET /admin/analytics?days=`, and `GET /admin/audit-logs`
- `GET /admin/verifications`, `PATCH /admin/verifications/:entityType/:entityId`, and `GET /admin/verifications/:entityType/:entityId/history`
- `GET /admin/users`, `GET /admin/users/:id`, `GET /admin/users/:id/activity`, and `PATCH /admin/users/:id/status|verification`
- `GET /admin/content-reports`, `PATCH /admin/content-reports/:id`, and `GET|PATCH /admin/moderation/content...`
- `GET|POST /admin/categories`, `PUT|DELETE /admin/categories/:type/:id`, and `GET|PUT /admin/settings`

## Files Modified

- API and tests: `artifacts/api-server/package.json`, `artifacts/api-server/src/lib/ai-provider.ts`, `artifacts/api-server/src/lib/ai-ranking.ts`, `artifacts/api-server/src/lib/ai-recommendations.ts`, `artifacts/api-server/src/routes/ai.ts`, `artifacts/api-server/src/routes/index.ts`, and `artifacts/api-server/test/ai.test.mjs`
- Database: `lib/db/src/schema/ai.ts` and `lib/db/src/schema/index.ts`
- API contract/codegen: `lib/api-spec/openapi.yaml`, `lib/api-client-react/src/generated/api.ts`, `lib/api-client-react/src/generated/api.schemas.ts`, `lib/api-zod/src/generated/api.ts`, and the generated AI type/parameter files under `lib/api-zod/src/generated/types/`
- Existing ShopNear UI/client: `artifacts/shopnear/src/App.tsx`, `artifacts/shopnear/src/components/ai-marketplace.tsx`, and `artifacts/shopnear/src/lib/auth-api.ts`
- Phase 7 API/schema/UI: `artifacts/api-server/src/routes/chat.ts`, `artifacts/api-server/src/routes/notifications.ts`, `artifacts/api-server/src/routes/reviews.ts`, `lib/db/src/schema/engagement.ts`, `lib/api-spec/openapi.yaml`, `artifacts/shopnear/src/phase7.tsx`, and `artifacts/shopnear/src/App.tsx`
- Phase 8: `artifacts/api-server/src/lib/admin-policy.mjs`, `artifacts/api-server/src/lib/admin-policy.d.mts`, `artifacts/api-server/src/lib/audit.ts`, `artifacts/api-server/src/routes/admin.ts`, `artifacts/api-server/test/admin-policy.test.mjs`, `artifacts/shopnear/src/phase8.tsx`, `lib/api-spec/openapi.yaml`, generated API client/Zod files, and `.agents/memory/phase8-settings.md`
- Documentation: `docs/README.md`, `docs/API.md`, `docs/DATABASE.md`, `docs/ARCHITECTURE.md`, `docs/AI.md`, `docs/SECURITY.md`, `docs/ROADMAP.md`, `docs/CHANGELOG.md`, `docs/DECISIONS.md`, `replit.md`, `PROJECT_MEMORY.md`, and `HANDOFF.md`

## Verification Results

- Phase 8: `pnpm run build` passed, including workspace typechecks and API, ShopNear, and mockup production builds. Vite reported a non-fatal existing tooltip sourcemap warning and the main bundle-size advisory.
- Phase 8: `pnpm --filter @workspace/api-server test` passed all 11 tests (6 admin-policy/audit tests and 5 AI parser/ranking tests).
- Phase 8: read-only development database inspection confirmed all expected admin, verification, analytics, moderation, audit, settings, and category tables, with `app_settings.value` stored as JSONB. No schema push was run.
- Phase 8: `/api/healthz` returned 200; unauthenticated `/api/admin/access` returned the expected 401.
- Phase 8: ShopNear and API workflows restarted successfully; all three configured workflows are running. API logs show the server listening without startup errors.
- Phase 8: the desktop Home page rendered. Browser API calls returned 401 while signed out, as expected. The signed-in admin screens were not visually verified because the preview browser has no session.
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

Phase 8 is complete. Await a new user-directed task. Do not start Phase 9.

## Next Prompt Context

Phase 8 is complete and documented. Preserve the existing ShopNear design, five-tab navigation, database records, and session boundary. Do not start Phase 9.