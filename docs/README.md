# ShopNear Documentation

This folder is the source of truth for the ShopNear product and its implementation decisions.

## Documents

- [Project overview](PROJECT_OVERVIEW.md)
- [Architecture](ARCHITECTURE.md)
- [Database](DATABASE.md)
- [API](API.md)
- [AI](AI.md)
- [Security](SECURITY.md)
- [Deployment](DEPLOYMENT.md)
- [Changelog](CHANGELOG.md)
- [Roadmap](ROADMAP.md)

Phase 2 adds phone/OTP authentication, database-backed sessions, role-aware account setup, protected profile registration, audit logging, and the configurable “New on ShopNear” discovery surface. Phase 3 adds persistent product/service management, category administration, catalog discovery, marketplace search, featured/newest surfaces, and business metrics.

## Phase 2 finalization status

- Neon schema reconciliation and API health checks passed.
- Customer, business, service-provider, and admin authentication/account paths passed the smoke audit.
- Nullable service-provider JSON arrays are normalized at the API boundary so existing database rows remain compatible with the response contract.
- Authenticated upload URL requests reach the configured Replit App Storage sidecar, but the current runtime rejects the sidecar credential exchange with `401 no allowed resources`; upload storage remains an environment limitation until the bucket resource is made available to the runtime.

## Phase 3 completion status

- Additive marketplace schema changes were applied to the development database without replacing existing ownership relationships.
- OpenAPI was updated and regenerated successfully.
- The Profile management UI supports the expanded product/service fields, while Search uses the marketplace API and the business dashboard displays the expanded metrics.
- Production-style workspace build and API marketplace smoke checks passed.

## Phase 4 completion status

- Added persistent entity-based customer favorites using the existing database table and unique user/entity index.
- Added public business, product, and service detail endpoints with related listings and view counters.
- Home discovery now reads featured businesses, products, and services from the API with loading and empty states.
- Search links API-backed businesses, products, and services to their public detail pages.
- Favorites now load from the authenticated API and preserve the existing five-tab navigation and ShopNear visual language.
- OpenAPI and generated client/Zod types are synchronized.

## Phase 5 completion status

- Added opt-in GPS controls, private customer location storage, and manual city/state selection.
- Nearby Home/Search results include radius filtering, straight-line distances, and verified/featured/newest filters.
- Public business/provider coordinates require owner opt-in and approval; customer coordinates are never public.
- OpenAPI and generated client/Zod types are synchronized. Road travel distance/time remain nullable until a map provider is selected.

## Phase 6 — ShopNear AI

- Added a provider-independent `AIProvider` boundary with a rule-based mock provider; no paid AI service or vendor credential is required.
- Search interprets natural-language intent, category, city, price bounds, and supported filters, then ranks only approved public listings.
- Added recommendation, suggestion, conversation-history, and per-user preference endpoints. AI search remains additive to the existing marketplace search.
- AI search history is optional and user-scoped. Request GPS coordinates are used for distance ranking only and are not stored in search history or logs.
- See `AI.md`, `API.md`, `DATABASE.md`, `ARCHITECTURE.md`, and `DECISIONS.md` for contracts, limitations, and future integration boundaries.

## Phase 7 — Chat, notifications, reviews, and ratings

- Added persistent chat, blocks, reports, notifications, preferences, and reviews without replacing existing tables or deleting data.
- Added live chat updates with REST recovery, read receipts, typing state, customer review forms, public rating summaries, and administrator moderation.
- Favorites remain business/product/service saves and now load through a paginated API.
- The development schema push was additive. Phase 8 remains unstarted.