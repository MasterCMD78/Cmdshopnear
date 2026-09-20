---
name: App Storage runtime authorization
description: ShopNear's provisioned App Storage bucket can still be unavailable to the local sidecar credential exchange.
---

The App Storage setup can report success and expose bucket environment variables while the running Replit sidecar still rejects GCS credential exchange with `401 no allowed resources`.

**Why:** The upload route and the official external-account GCS configuration both reached the sidecar, but the sidecar rejected the bucket resource before URL signing. This distinguishes runtime authorization from an API validation or route bug.

**How to apply:** When upload URL generation fails, verify `/credential`, the sidecar token exchange, and the configured bucket resource before changing the storage route or replacing the supported client setup.