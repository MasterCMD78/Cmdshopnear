# API

The API is mounted at `/api`. All JSON bodies are validated with Zod schemas generated from `lib/api-spec/openapi.yaml`.

## Authentication

- `POST /auth/request-otp` — create a phone OTP challenge
- `POST /auth/verify-otp` — verify a challenge and establish a session
- `POST /auth/logout` — revoke the current session and clear the cookie
- `GET /auth/session` — validate the session and return the current user
- `POST /register` — complete a verified user registration
- `POST /login` — request a login OTP
- `POST /verify-otp` — compatibility alias for OTP verification

## Account

- `GET /profile` — return the authenticated profile
- `PUT /profile` — update profile fields
- `GET /location` — return the authenticated user's location and permission settings
- `PUT /location` — update GPS location, permission state, or manual city/state; coordinates must be a valid latitude/longitude pair
- `POST /businesses` — create a business registration
- `GET /businesses/mine` — load the authenticated user's business
- `PUT /businesses/:id` — update an owned business
- `PUT /businesses/:id/location` — explicitly enable or update an owned business's public-discovery location
- `POST /service-providers` — create a service provider registration
- `GET /service-providers/mine` — load the authenticated user's provider profile
- `PUT /service-providers/:id` — update an owned provider profile
- `PUT /service-providers/:id/location` — explicitly enable or update an owned provider's public-discovery location
- `GET /new-on-shopnear` — return currently eligible approved businesses and providers

## Storage

- `POST /storage/uploads/request-url` — request an authenticated presigned upload URL for a JPEG, PNG, or WebP image up to 5 MB
- `GET /storage/objects/:path` — serve an uploaded object for its owner or an administrator

The upload endpoint accepts metadata only. The client uploads the file directly to the returned URL and stores the returned `/objects/...` path, not the file bytes, in application data. During the Phase 2 finalization audit, the route and validation passed, but the development App Storage runtime returned `401 no allowed resources` while signing the URL; this is documented as a runtime integration limitation rather than an API contract change.

## Marketplace management

- `GET /marketplace/categories` — list visible product and service categories
- `GET /marketplace/catalog?query=&categoryId=&featured=&newest=&location=&tag=&page=&limit=` — list visible, available, published products and services with discovery filters
- `GET /marketplace/featured` — return featured, trending/newest products and services plus approved businesses/providers
- `GET /marketplace/search?query=&verified=&city=&state=&featured=&newest=&page=&limit=` — search businesses, service providers, products, and services
- `GET /marketplace/nearby?latitude=&longitude=&radiusKm=&query=&city=&state=&verified=&featured=&newest=&page=&limit=` — find nearby businesses, providers, products, and services; `radiusKm` is 0.1–100 and defaults to 25
- `GET /businesses/:id` — public approved business detail with products, services, and related businesses
- `GET /products/:id` — public published product detail with its business and related listings
- `GET /services/:id` — public published service detail with its business/provider and related services
- `GET /favorites` — list the authenticated user's saved businesses, products, and services
- `POST /favorites` — save a public business, product, or service using `{ targetType, targetId }`
- `DELETE /favorites/:targetType/:targetId` — remove an authenticated user's saved listing
- `GET /business/dashboard` — return business marketplace metrics
- `GET /business/products` — list the authenticated business's products
- `POST /business/products` — create a product
- `PUT /business/products/:id` — update an owned product, including price, availability, and visibility
- `DELETE /business/products/:id` — delete an owned product
- `GET /provider/services` — list the authenticated provider or business's services
- `POST /provider/services` — create a service
- `PUT /provider/services/:id` — update an owned service, including price, radius, availability, and visibility
- `DELETE /provider/services/:id` — delete an owned service

Product and service mutations are owner-scoped in the API. The UI provides the first marketplace-management surface from the authenticated Profile area while preserving the existing bottom navigation and mobile-first shell.

## Administration

- `GET /admin/settings/new-on-shopnear` — read the configured window
- `PUT /admin/settings/new-on-shopnear` — update the window as an administrator
- `GET /admin/categories?type=products|services` — list all categories as an administrator
- `POST /admin/categories` — create a product or service category
- `PUT /admin/categories/:type/:id` — update a category's name, slug, ordering, or visibility
- `DELETE /admin/categories/:type/:id` — delete a category

Protected routes return `401` when there is no valid session and `403` when the role is not allowed.

Nearby results include straight-line `distanceKm` for radius filtering and sorting. `travelDistanceMeters` and `travelTimeSeconds` are nullable until a routing provider is configured. The current map provider is `none`; no provider-specific key or map SDK is required for GPS and straight-line discovery.

## Phase 6 AI routes

- `POST /ai/search` — interpret a natural-language marketplace query and return intent, approved public results, filters, corrections, and related searches. The optional `conversationId` enables follow-up queries; latitude and longitude must be supplied together.
- `GET /ai/recommendations` — return recommended, trending, and recent-popular listing groups. Optional coordinates are used only for that request.
- `GET /ai/suggestions?query=...` — return spelling corrections, related searches, suggested categories, and next searches.
- `GET /ai/history` — list the authenticated user's recent AI searches. History is saved only when that user's preference permits it.
- `DELETE /ai/history` — delete the authenticated user's saved AI searches.
- `GET /ai/preferences` and `PUT /ai/preferences` — read or update recommendation, personalization, history-saving, and category preferences.

The AI routes use a 30-request-per-minute in-memory rate limit. Preferences and history require the existing session cookie. Search and recommendation responses omit raw coordinates and return only eligible public listing data. The mock provider currently supports English text queries; unsupported opening-hours and provider-gender filters are reported rather than claimed as applied. Search also explains when proximity cannot be applied without coordinates or featured filtering excludes business/provider profiles.

## Phase 7 chat, notifications, reviews, and ratings

All routes below are mounted under `/api` and use the existing HTTP-only session cookie where marked as protected.

- `GET|POST /chat/conversations` — list/search the current user's paginated conversations or start/reopen a customer conversation from a public business, product, or service listing.
- `GET /chat/messages?conversationId=&before=&limit=` — read a conversation's messages and mark incoming messages read; `POST /chat/conversations/:id/messages` sends bounded plain text.
- `PUT /chat/conversations/:id/read` and `PUT /chat/conversations/:id/typing` — update read receipts and short-lived typing state.
- `DELETE /chat/messages/:id` — soft-delete a message sent by the current user.
- `POST /chat/conversations/:id/report`, `GET /chat/blocks`, `POST|DELETE /chat/blocks/:userId` — report a conversation and list, block, or unblock users.
- `GET /chat/events` — authenticated server-sent updates; clients also refresh through REST so reconnects recover missed events.
- `GET /notifications`, `GET /notifications/unread-count`, `PUT /notifications/:id/read`, and `PUT /notifications/read-all` — paginated user-owned history and read state.
- `GET|PUT /notifications/preferences` — read or update per-category delivery preferences.
- `POST /admin/notifications/announcements` — administrator-only in-app announcements.
- `GET /ratings/:targetType/:targetId` — return the average, count, and 1–5 star distribution for a business, product, or service.
- `GET /reviews?targetType=&targetId=` and `GET /reviews/mine?targetType=&targetId=` — list public reviews or the current customer's review.
- `POST /reviews`, `PUT /reviews/:id`, `DELETE /reviews/:id`, and `POST /reviews/:id/report` — customer-owned review lifecycle and reporting.
- `GET /admin/reviews`, `PATCH /admin/reviews/:id/moderation`, `GET /admin/content-reports`, and `PATCH /admin/content-reports/:id` — administrator moderation.
- `GET /favorites?page=&limit=` — paginate the current customer's saved businesses, products, and services; existing create/delete endpoints remain unchanged.

Review uniqueness is enforced per customer and listing. Verified-customer state is assigned by the server, not accepted from the client. Hidden reviews are excluded from public lists and rating summaries.