# Project Memory

## Phase 2 decisions

- The OTP service is interface-based. Local development returns a development-only code; production SMS can be added behind the same interface.
- JWTs are paired with database sessions. The cookie carries the signed token, while the session row provides revocation and logout authority.
- Role authorization is enforced in API middleware, not trusted from frontend state.
- New-on-ShopNear visibility is derived from approval timestamps and an admin-controlled day count, defaulting to 30.
- User media stores object paths and metadata, not binary file contents in PostgreSQL.
- The project uses the imported Neon PostgreSQL database through the Replit `DATABASE_URL` secret. Drizzle `push` is the current schema reconciliation workflow because no committed migration directory exists.
- Service-provider JSON arrays are nullable in the existing schema; API responses normalize them to empty arrays to preserve the current contract without changing storage.
- Replit App Storage is provisioned, but this runtime currently rejects its sidecar credential exchange with `401 no allowed resources`; treat upload verification as an environment dependency.
- Phase 4 customer favorites use the existing entity-based database table and unique user/entity index; do not replace it with per-entity nullable foreign-key columns.
- Phase 5 stores location data additively on existing user, business, and provider records. Keep customer GPS private; public business/provider coordinates require explicit opt-in and approval.
- Nearby discovery calculates straight-line distance with Haversine and filters by radius. Road distance/time remain nullable behind a provider-neutral map adapter until a vendor is selected.