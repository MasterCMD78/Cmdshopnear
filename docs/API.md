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

## Administration

- `GET /admin/settings/new-on-shopnear` — read the configured window
- `PUT /admin/settings/new-on-shopnear` — update the window as an administrator

Protected routes return `401` when there is no valid session and `403` when the role is not allowed.