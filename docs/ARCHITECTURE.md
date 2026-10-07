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

## Phase 5 location and nearby discovery

GPS permission and the customer's location are managed through authenticated location routes; users can also provide a manual city/state. Business and service-provider locations are separately owner-scoped and require an explicit public-sharing action. Nearby search uses validated coordinates, Haversine distance, radius filtering, and city/state, verification, featured, and newest filters.

Map and routing behavior stays behind a provider-neutral `MapProvider` interface. The active adapter currently returns no road distance/time, so those response fields are `null`; straight-line distance remains available without a third-party service. Choosing a routing/map vendor can replace the adapter without changing marketplace search logic.

## Phase 6 AI search and recommendations

`AIProvider` is a separate adapter boundary from marketplace data access. The initial mock implementation interprets English text using normalized terms, category rules, price/location parsing, typo correction, and prior intent. The service layer applies validated intent to existing Drizzle tables, scores eligible listings, and returns a stable result shape. REST routes own validation, session-scoped history, preferences, and rate limiting; the existing marketplace endpoints and pages remain in place.

Recommendation ranking is shared and supports nearby, featured, newest, verified, popularity, and preferred-category signals. Nearby distance is computed only against approved listings whose owners enabled public location. The search boundary includes modality and language fields so future voice-transcription, image-query, multilingual, and external-model adapters can be added without changing the marketplace contract.

## Phase 7 engagement

Chat conversations and messages are scoped through database participants and the existing session/role boundary. Message deletion is a soft delete; blocks and reports are persisted. An authenticated server-sent event stream provides quick updates, while REST refetches recover after reconnects. Notifications and category preferences are user-owned records. Reviews are unique per customer and listing, and the API derives rating summaries from visible reviews rather than trusting client-supplied totals.

## Phase 8 administration

Administrator permissions are defined centrally and checked by API middleware; account type alone never grants staff access. The role management flow assigns only active administrator accounts. Super Admin transfer is transactional: the prior Super Admin becomes a Moderator, and the transfer is audited.

The existing administrator UI reuses the verification, user, report, moderation, analytics, settings, audit, and role APIs. Category administration uses the existing product/service category tables and generated API hooks. Analytics are aggregate-only and bounded by the requested date window.

Future platform settings are stored in the existing `app_settings` JSONB record. Phase 8 deliberately does not connect those flags or defaults to live runtime behavior.

## Phase 9 request boundaries

The Express API applies same-origin mutation checks, bounded body parsing, generic error responses, and security headers before feature routes. Session claims are checked against the revocable database session and current user role. OTP attempts use conditional database updates so invalid attempts cannot race past the limit or consume a challenge more than once. Private image retrieval validates ownership and streams a bounded response from the trusted storage host instead of redirecting the browser to a signed URL.