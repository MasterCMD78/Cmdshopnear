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