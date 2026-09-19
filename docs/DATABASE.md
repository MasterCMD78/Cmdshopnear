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

User-uploaded files are stored outside PostgreSQL. Rows store object paths and metadata only.

## Compatibility

The schema uses the names and concepts from the official specification. Nullable optional fields are retained for future email/social login and future profile fields. No existing table is dropped or renamed.

## New-listing setting

`new_on_shopnear_days` defaults to `30`. Administrators can update it through the protected settings endpoint. A value of zero disables the section without deleting any approved listing.

## Verification

- Database connection: successful through `DATABASE_URL`
- Schema: seven tables created and confirmed against the Drizzle definitions
- Foreign keys: four validated relationships are present
- Indexes: primary-key indexes and the unique indexes for `users.phone` and `sessions.token_hash` are present
- Seed/demo data: none exists in the project; all seven tables are currently empty
- API: `GET /api/healthz` returns `{"status":"ok"}`