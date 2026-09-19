---
name: Vite workspace builds
description: Environment requirements for local verification of artifact Vite builds.
---

Workspace Vite builds that use the artifact configs require `PORT` and `BASE_PATH` to be set, even when they are run as production builds rather than through the managed workflow.

**Why:** The configs intentionally fail fast when artifact routing variables are absent.

**How to apply:** Set representative workflow values such as `PORT=4173 BASE_PATH=/shopnear/` when running the root build manually.