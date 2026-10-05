# Changelog

## Phase 2 — Authentication & User Accounts

- Added phone/OTP authentication contract and local development provider.
- Added database-backed JWT sessions, logout, session validation, and role middleware.
- Added customer, business, service provider, and admin account boundaries.
- Added business/provider registration and profile update contracts.
- Added configurable “New on ShopNear” eligibility window with a 30-day default.
- Normalized nullable service-provider skills and portfolio image arrays at the response boundary without changing the existing database schema.
- Verified the Neon schema, health endpoint, role boundaries, account setup paths, session revocation, and administrator settings flow.
- Added security, architecture, API, database, and deployment documentation.

### Phase 2 finalization audit

- Typecheck and production-style workspace build passed.
- Replit App Storage provisioning is present, but upload URL signing is currently blocked by the runtime sidecar returning `401 no allowed resources` during credential exchange. No storage architecture change was made.

## Phase 3 — Marketplace Management

- Added persistent product and service categories and owner-scoped marketplace listings.
- Added product and service CRUD APIs with availability, visibility, pricing, service radius, and audit logging.
- Added public marketplace catalog/category endpoints and a business dashboard metrics endpoint.
- Added mobile-first product/service management controls to the authenticated Profile surface without changing the existing navigation or brand.
- Added listing metadata for images, primary images, regular/discount pricing, brands, conditions, specifications, locations, tags, featured state, and publication scheduling.
- Added featured, trending/newest, location/tag-filtered catalog discovery and cross-entity marketplace search.
- Added administrator category CRUD endpoints and expanded business dashboard metrics for visibility, featured listings, views, favorites, and follow-up analytics placeholders.
- Updated the existing Search surface to read marketplace results from the API and expanded the Profile dashboard panel to show the returned metrics.
- Regenerated OpenAPI client/Zod types and verified the additive schema changes against the development database.

## Phase 4 — Customer Marketplace Experience

- Recovered the existing entity-based favorites table and added API-backed favorite list, create, and delete flows without recreating tables.
- Added public approved business, product, and service detail endpoints with related listings and view counting.
- Replaced hard-coded Home discovery cards and Search result navigation with featured and search API data.
- Added detail screens, loading states, empty states, verification badges, and persistent favorite controls while preserving the existing navigation and brand.
- Regenerated OpenAPI client/Zod types and verified typecheck and production artifact builds.

## Phase 5 — GPS, Maps & Nearby Discovery

- Added additive location metadata to existing user, business, and service-provider records without recreating tables.
- Added authenticated customer location/permission routes and owner-scoped business/provider location updates.
- Kept customer coordinates private; public coordinates are exposed only for approved, enabled, explicitly public businesses and providers.
- Added nearby search with radius validation, straight-line distance, distance/newest sorting, and city/state, verified, and featured filters.
- Connected Home and Search to browser location with radius selection; added manual city/state controls and business/provider location sharing controls in Profile.
- Added a provider-neutral map/routing adapter with nullable road-distance/time fields because no external map provider is configured.
- Regenerated OpenAPI client and Zod schemas.

## Phase 6 — ShopNear AI

- Added the mock `AIProvider`, natural-language intent parsing, typo correction, category suggestions, and follow-up context.
- Added public-listing recommendation ranking and additive AI search, recommendation, suggestion, history, and preference routes.
- Added per-user AI controls and history clearing to Profile, recent search chips to Search, and recommendation sections to Home.
- Added additive `ai_preferences` and `ai_search_history` tables; preserved existing marketplace and location tables.
- Documented unsupported opening-hours/gender filters and the absence of weekly engagement and recently viewed events.

## Phase 7 — Chat, Notifications, Reviews & Ratings

- Added participant-scoped plain-text chat, search, read receipts, typing state, soft deletion, block/unblock, reports, and authenticated live updates.
- Added user-owned notification history, unread counts, category preferences, mark-read actions, and administrator announcements.
- Added customer reviews with editable ownership, server-derived verified-customer state, rating summaries, reporting, and administrator moderation.
- Added review/rating displays and listing message actions to existing detail pages while retaining the ShopNear design and five-tab navigation.
- Added pagination to favorites and persisted block-state retrieval; retained the existing favorites table.
- Applied the additive development schema and synchronized OpenAPI client/Zod types and project documentation.