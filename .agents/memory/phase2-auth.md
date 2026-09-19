---
name: Phase 2 auth boundary
description: Durable authentication, account, upload, and discovery decisions for ShopNear.
---

ShopNear Phase 2 keeps authentication provider-agnostic: local OTP is an implementation of an `OtpProvider`, and production SMS can replace it without changing route or UI contracts.

**Why:** The product needs a working development flow now while preserving a clean boundary for a real SMS provider later.

**How to apply:** Keep verification, role checks, session creation, and account setup on the API. Treat the HTTP-only JWT cookie as a handle to a database session so logout and revocation remain authoritative.