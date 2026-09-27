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