# Architecture

## Runtime

- React/Vite frontend in `artifacts/shopnear`
- Express API in `artifacts/api-server`
- PostgreSQL with Drizzle in `lib/db`
- OpenAPI-first contract in `lib/api-spec`

## Authentication boundary

The API owns identity, verification, role authorization, session validity, and audit logging. The frontend only renders the flow and sends requests with credentials.

The authentication pipeline is:

```text
phone -> request OTP -> verify OTP -> choose role -> complete profile -> marketplace
```

The local OTP implementation is behind `OtpProvider`, allowing a future SMS provider to replace it without changing route handlers or UI contracts.

## Session model

Successful verification signs a JWT containing the user id, role, session id, and expiry. The JWT is written to an HTTP-only, same-site cookie. A database session row remains authoritative for revocation and logout. Protected routes validate both the token and the session record.

## Role model

Roles are `customer`, `business`, `service_provider`, and `admin`. Role guards run in API middleware. Registration routes additionally verify ownership and prevent a user from creating a second account record for the same role.

## New on ShopNear

Approved businesses and service providers are eligible when their `approved_at` timestamp is within the configured duration. The duration lives in an application settings row and defaults to 30 days.