# Security

## Implemented in Phase 2

- OTP values are hashed before storage and expire after a short challenge window.
- OTP requests and verification attempts are rate limited in the API process.
- JWT signing uses the configured `SESSION_SECRET`.
- JWTs are stored in HTTP-only, same-site cookies rather than browser storage.
- Database session rows support revocation and logout.
- Role middleware protects account and admin routes.
- Request bodies are validated and bounded.
- Account status is checked on every authenticated request.
- Security-sensitive actions are written to `audit_logs`.
- Upload metadata is restricted to safe image types and bounded sizes before object storage.
- Upload URL generation is authenticated and owner-scoped; the API returns metadata and object paths, not uploaded file contents.

## Development OTP

The local provider is for development only. In development, the API returns a `developmentOtp` value so the UI can complete the flow without SMS. Production must use an SMS provider implementation and must not return the OTP in an API response.

## Future work

Password hashing, external social login, production SMS delivery, object ACL review, distributed rate limiting, and stronger operational monitoring remain planned hardening work. App Storage still needs a runtime resource-authorization check before uploads can be considered operationally verified.

## Phase 4 marketplace boundaries

- Detail routes do not expose pending businesses or unpublished/hidden/unavailable listings.
- Favorite reads, writes, and deletes require the authenticated session; the API validates both the target type and UUID.
- Favorite mutations are audit logged and scoped to the current user.

## Phase 5 location boundaries

- Customer GPS is opt-in, stored with permission state, private by default, and available only through the authenticated user's location route.
- Public business/provider coordinates require valid coordinates, location enabled, explicit public visibility, and approved verification status. Pending or private coordinates are removed before public serialization.
- Location changes for businesses and service providers are owner-scoped; administrators retain their existing role-based access.
- Public nearby search validates coordinate bounds and radius limits. It returns only records with eligible public coordinates and does not include the customer's location in result records.
- Road distance and travel time are not fabricated: they are `null` until a real map/routing provider is configured.

## Phase 6 AI handling

- AI input is schema-validated and limited to 240 characters; coordinates must be supplied as a valid pair. AI routes have an in-memory rate limit.
- Search logs record provider, intent type, result count, and whether location/history was used; they do not record the raw query or coordinates.
- GPS coordinates are request-scoped and are not written to history, preferences, or result payloads. Distance is calculated only from public coordinates on eligible listings.
- Saved history and preferences are restricted to the authenticated user. Users can disable history saving or delete their saved history.
- Search results exclude unapproved businesses/providers and unpublished, hidden, unavailable, or unapproved listings. Unsupported gender and opening-hours filters are disclosed instead of being represented as applied.

## Phase 7 engagement boundaries

- Chat history, read/typing state, blocks, and notifications are scoped to the authenticated account; only conversation participants can read or send messages.
- Messages are plain text with bounded length. Deletion is soft so the conversation history remains structurally consistent.
- A block prevents new messages between the two accounts; only the blocking account can list or remove its block.
- Customers can create and edit only their own reviews. The API derives verified-customer status and public rating totals; clients cannot set either.
- Review and conversation reports are private to moderators. Administrator-only routes control report resolution and review visibility.
- SSE connections require the session cookie and are closed when the session/account is no longer valid.