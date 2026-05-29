---
name: api-zod codegen pitfalls
description: Two recurring gotchas when consuming the Orval-generated Zod schemas in this repo.
---

# @workspace/api-zod codegen pitfalls

## TS2308 name collision
`lib/api-zod/src/index.ts` must only `export * from "./generated/api"`. Do NOT also re-export the generated
types barrel.
**Why:** Orval emits both a path-param and a query-param schema named `*Params` for the same route, and re-exporting
the types barrel surfaces both names → TS2308 duplicate-identifier error.

## Timestamps are strings in response schemas
Generated response Zod schemas type timestamp fields as `string` (not `Date`). DB rows return `Date` objects.
**How to apply:** serializers must call `.toISOString()` on every Date (null-safe for nullable ones) before
`.parse()`, or validation throws.
