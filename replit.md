# ShopNear

ShopNear is a mobile-first local marketplace that helps people discover trusted nearby businesses, products, and services.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server using the workflow-provided `PORT`
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Neon PostgreSQL connection string, configured as a Replit Secret
- The app, Drizzle schema tooling, and API database client all read `DATABASE_URL` automatically; never hardcode its value.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/shopnear` — React/Vite customer-facing app and existing marketplace UI
- `artifacts/api-server` — Express API, authentication, account, and marketplace routes
- `lib/db/src/schema` — Drizzle/PostgreSQL source of truth
- `lib/api-spec/openapi.yaml` — REST contract source of truth
- `docs` — project, API, database, security, deployment, and phase documentation
- `PROJECT_MEMORY.md` — durable implementation decisions for this project
- `HANDOFF.md` — current phase, verification, limitations, and exact next task

## Architecture decisions

- Phase 2 uses a replaceable `OtpProvider` interface with a local development provider; no SMS vendor is required for local development.
- JWT access tokens are held in secure, HTTP-only cookies and are backed by database session records so logout and session revocation work.
- Role-specific account setup is protected server-side; the UI is only a convenience layer.
- Uploaded user media uses authenticated object-storage upload paths; database rows retain object paths rather than file bytes.
- App Storage is provisioned through Replit secrets, but the current development runtime returns `401 no allowed resources` during sidecar credential exchange; do not treat uploads as verified until that runtime authorization is resolved.
- “New on ShopNear” is computed from approval timestamps and an admin-controlled duration, defaulting to 30 days.

## Product

- Existing marketplace dashboard with Home, Search, Favorites, Messages, and Profile navigation
- Phase 2 phone/OTP onboarding and session-aware account setup
- Phase 3 owner-scoped product and service management with availability, visibility, pricing, categories, catalog, and business metrics
- Customer, Business, Service Provider, and Administrator roles
- Business and service provider registration with verification-ready status
- Automatically surfaced newly approved businesses and service providers
- Phase 4 customer marketplace detail pages, related listings, API-backed discovery, and persistent favorites
- Phase 5 opt-in GPS, manual city/state location, nearby search, distance/radius filtering, and public business/provider location controls
- Phase 7 participant-scoped chat, notifications, customer reviews, rating summaries, moderation, and paginated favorites

## User preferences

- Preserve the existing ShopNear brand, logo, navigation, and completed marketplace UI.
- Preserve completed phases and make only additive changes needed for the explicitly requested work.

## Gotchas

- Development OTP is intentionally local and is returned only in development responses; replace the provider implementation before production SMS.
- `SESSION_SECRET` is required for signing tokens; never commit or print its value.
- Run API codegen after changing `lib/api-spec/openapi.yaml`.
- Run database push only against the development database.
- The existing development database already contains the entity-based `favorites` table (`user_id`, `entity_type`, `entity_id`); preserve that shape when extending favorites.
- The current development database is Neon PostgreSQL configured through the Replit `DATABASE_URL` secret. Run `pnpm --filter @workspace/db run push` to reconcile it with the Drizzle schema.
- Customer GPS is opt-in and private. Public business/provider coordinates require explicit owner sharing, valid coordinates, and approved verification status.
- Nearby distance is straight-line; travel distance/time remain null until a map/routing provider is selected. Keep that provider behind the existing adapter boundary.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details

## Phase 6 AI conventions

- Keep ShopNear's AI provider-independent. The initial provider is a deterministic mock; do not add paid APIs or credentials unless explicitly requested.
- AI search is additive to marketplace search and must return only approved, publicly visible listings.
- Customer GPS is request-scoped. Never write exact request coordinates into AI history, preferences, or logs; public listing distance requires owner opt-in and approval.
- Saved AI history is user-owned, optional, and clearable. Use the existing session boundary and additive Drizzle schema changes only.
- Do not claim open-now, provider-gender, weekly-engagement, or recently-viewed behavior when the existing data model cannot support it; communicate limitations in the UI/API.
- Phase 7 is complete. Preserve existing data and the current design/navigation; do not begin Phase 8 without explicit approval.
