---
name: api-zod codegen barrel regeneration
description: Orval codegen reintroduces a TS2308-causing barrel line in lib/api-zod/src/index.ts every run.
---

# api-zod codegen rewrites index.ts

Running `pnpm --filter @workspace/api-spec run codegen` (Orval) **rewrites `lib/api-zod/src/index.ts` and re-adds `export * from "./generated/types";`** alongside the intended `export * from "./generated/api";`.

That second barrel re-exports the same `*Params` names that `generated/api` already exports (any endpoint with both path params and query params generates a path-`*Params` and a query-`*Params` that collide), so `tsc --build` / `typecheck:libs` fails with TS2308 ("Module ./generated/api has already exported a member named ...").

**The committed/correct state of `index.ts` is a single line:** `export * from "./generated/api";`

**How to apply:** after any codegen run, restore `index.ts` to that single line before relying on the typecheck. The codegen step itself runs `typecheck:libs` and will appear to fail for this reason even when the spec changes are correct — fix the barrel, then re-run the typecheck.

**Why:** the typescript-typed schema output and the zod output both emit the same param type names; re-exporting both barrels duplicates them. This is the same root cause noted in replit.md's gotcha, but the non-obvious part is that codegen *re-creates* the bad line, so it must be fixed after every regeneration, not just once.
