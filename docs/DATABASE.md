# Database

PostgreSQL is the system of record. Existing marketplace tables are preserved when present; Phase 2 adds the identity and account tables required for authentication.

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