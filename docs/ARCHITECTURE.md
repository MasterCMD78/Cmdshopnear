# Architecture

## Runtime

- React/Vite frontend in `artifacts/shopnear`
- Express API in `artifacts/api-server`
- PostgreSQL with Drizzle in `lib/db`
- OpenAPI-first contract in `lib/api-spec`
- Replit App Storage for user-uploaded media, with object paths retained in database records

## Authentication boundary

The API owns identity, verification, role authorization, session validity, and audit logging. The frontend only renders the flow and sends requests with credentials.

The authentication pipeline is:

```text
phone -> request OTP -> verify OTP -> choose role -> complete profile -> marketplace
```

The local OTP implementation is behind `OtpProvider`, allowing a future SMS provider to replace it without changing route handlers or UI contracts.

## Media storage boundary

Authenticated clients request a short-lived upload URL from the API, upload image bytes directly to App Storage, and retain the returned `/objects/...` path. The API does not proxy file bytes or store them in PostgreSQL. Object access is owner-scoped, with administrator access available for operational support.

The route uses the configured Replit sidecar signer. The current development runtime has the bucket variables configured, but its credential exchange currently returns `401 no allowed resources`; the storage boundary is implemented and the remaining issue is runtime resource authorization.

## Session model

Successful verification signs a JWT containing the user id, role, session id, and expiry. The JWT is written to an HTTP-only, same-site cookie. A database session row remains authoritative for revocation and logout. Protected routes validate both the token and the session record.

## Role model

Roles are `customer`, `business`, `service_provider`, and `admin`. Role guards run in API middleware. Registration routes additionally verify ownership and prevent a user from creating a second account record for the same role.

## New on ShopNear

Approved businesses and service providers are eligible when their `approved_at` timestamp is within the configured duration. The duration lives in an application settings row and defaults to 30 days.

## Phase 4 customer marketplace

Public detail routes expose only approved businesses and published, visible, available listings. Detail responses include related listings and increment product/service view counters. Favorites remain customer-owned records in the existing entity-based table; product and service favorite counters are updated only when a save is created or removed.