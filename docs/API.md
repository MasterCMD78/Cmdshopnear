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
- `POST /businesses` — create a business registration
- `GET /businesses/mine` — load the authenticated user's business
- `PUT /businesses/:id` — update an owned business
- `POST /service-providers` — create a service provider registration
- `GET /service-providers/mine` — load the authenticated user's provider profile
- `PUT /service-providers/:id` — update an owned provider profile
- `GET /new-on-shopnear` — return currently eligible approved businesses and providers

## Storage

- `POST /storage/uploads/request-url` — request an authenticated presigned upload URL for a JPEG, PNG, or WebP image up to 5 MB
- `GET /storage/objects/:path` — serve an uploaded object for its owner or an administrator

The upload endpoint accepts metadata only. The client uploads the file directly to the returned URL and stores the returned `/objects/...` path, not the file bytes, in application data. During the Phase 2 finalization audit, the route and validation passed, but the development App Storage runtime returned `401 no allowed resources` while signing the URL; this is documented as a runtime integration limitation rather than an API contract change.

## Marketplace management

- `GET /marketplace/categories` — list visible product and service categories
- `GET /marketplace/catalog?query=&categoryId=&featured=&newest=&location=&tag=&page=&limit=` — list visible, available, published products and services with discovery filters
- `GET /marketplace/featured` — return featured, trending/newest products and services plus approved businesses/providers
- `GET /marketplace/search?query=&verified=&page=&limit=` — search businesses, service providers, products, and services
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