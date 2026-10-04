# Database

PostgreSQL is the system of record. Existing marketplace tables are preserved when present; Phase 2 adds the identity and account tables required for authentication.

## Replit and Neon connection

ShopNear is connected to the new Neon PostgreSQL database through the Replit `DATABASE_URL` secret. The application and Drizzle configuration read this secret at runtime; the connection string is never stored in source code.

The database was provisioned from the existing Drizzle schema with:

```bash
pnpm --filter @workspace/db run push
```

The project does not contain a committed migration directory. `drizzle-kit push` is the existing schema-management command and is idempotent: it applies the current schema to an empty database and reports no changes when the database already matches the schema.

## Phase 2 tables

- `users` — profile, role, location, verification, and account status
- `sessions` — revocable JWT session metadata
- `otp_challenges` — hashed development OTP challenges with expiry and attempt counters
- `businesses` — business account setup and verification timestamps
- `service_providers` — provider account setup and verification timestamps
- `app_settings` — configurable platform settings, including the new-listing window
- `audit_logs` — security and account activity records

## Phase 3 marketplace tables

- `product_categories` and `service_categories` — normalized marketplace category records with ordering, visibility, and featured flags
- `products` — business-owned product names, descriptions, image object paths, integer prices, brand/condition/specification metadata, location/tags, availability, visibility, featured state, and publication scheduling
- `services` — business/provider-owned service names, descriptions, image object paths, starting prices, pricing options, service radius, working hours, booking/emergency flags, duration, location/tags, availability, visibility, featured state, and publication scheduling
- `favorites` — authenticated user/entity saves using `entity_type` and `entity_id`, with a unique `(user_id, entity_type, entity_id)` index

Product and service ownership is tied to the authenticated user and the related business/provider record. Prices are stored as integer cents to avoid floating-point currency drift.

## Phase 5 location additions

Phase 5 extends the existing `users`, `businesses`, and `service_providers` tables; it does not create replacement tables. These records now carry nullable text latitude/longitude (kept compatible with the existing coordinate representation), integer accuracy, last-update timestamp, location-enabled state, and public/private visibility. User rows also track browser permission state. User city/state remains available for manual search without requesting GPS.

Coordinates are validated and converted at API boundaries. Customer coordinates are private and are never included in public marketplace responses. Business/provider coordinates are used for discovery only when valid, enabled, explicitly public, and approved. Products and services use their owning business/provider location; no per-listing coordinate columns were added.

The current reconciliation remains the existing development-only Drizzle `push` workflow. Review its proposed changes and apply only additive column changes; do not force the push or recreate tables.

User-uploaded files are stored outside PostgreSQL. Rows store object paths and metadata only.

## Compatibility

The schema uses the names and concepts from the official specification. Nullable optional fields are retained for future email/social login and future profile fields. No existing table is dropped or renamed.

## New-listing setting

`new_on_shopnear_days` defaults to `30`. Administrators can update it through the protected settings endpoint. A value of zero disables the section without deleting any approved listing.

## Verification

- Database connection: successful through `DATABASE_URL`
- Schema: marketplace additions were applied successfully through the existing Drizzle push workflow
- Foreign keys: four validated relationships are present
- Indexes: primary-key indexes and the unique indexes for `users.phone` and `sessions.token_hash` are present
- Seed/demo data: none exists in the project; marketplace category and listing tables are empty until an authenticated owner creates records
- API: `GET /api/healthz` returns `{"status":"ok"}`
- Marketplace smoke checks: categories, catalog, featured discovery, and search return valid empty-state envelopes with the current unseeded database
- Phase 4 reconciliation: the existing entity-based `favorites` table was matched in Drizzle; no destructive migration or table recreation was performed.

## Phase 6 additions

- `ai_preferences`: one row per user for recommendation, personalization, history-saving, and preferred-category settings.
- `ai_search_history`: user-owned questions and compact intent context, indexed by user/date and user/conversation/date. Foreign keys cascade when an account is deleted.
- Search coordinates are not stored. History can be disabled per account or cleared through the API.
- Schema changes are additive; existing marketplace, account, authentication, and location tables are unchanged.
- Development schema push verification added only these two AI tables and their foreign keys/indexes; no existing tables were altered.