---
name: Signed object URL handling
description: Security boundary for serving private objects uploaded through Replit App Storage.
---

Do not redirect authenticated users directly to URLs returned by the storage signer. Validate the signed URL against the trusted storage-host allowlist, then stream permitted content through the authenticated API with strict type, size, and timeout limits.

**Why:** The static redirect scanner continued to treat a trusted sidecar URL as tainted after helper-based validation. Proxying the bounded object removed the redirect boundary and kept signed URLs out of browser-visible `Location` headers.

**How to apply:** For private object reads, keep owner/path authorization in the API, fetch only from the trusted storage host, reject unexpected content types and oversized bodies, and avoid forwarding cacheable private data. Direct PUT limits must be enforced by the storage signer or bucket policy; client metadata alone is not proof of the uploaded bytes.
