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