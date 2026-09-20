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