# Project Memory

## Phase 2 decisions

- The OTP service is interface-based. Local development returns a development-only code; production SMS can be added behind the same interface.
- JWTs are paired with database sessions. The cookie carries the signed token, while the session row provides revocation and logout authority.
- Role authorization is enforced in API middleware, not trusted from frontend state.
- New-on-ShopNear visibility is derived from approval timestamps and an admin-controlled day count, defaulting to 30.
- User media stores object paths and metadata, not binary file contents in PostgreSQL.