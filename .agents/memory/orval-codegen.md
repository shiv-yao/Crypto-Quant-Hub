---
name: Orval codegen config
description: How orval is configured in this repo for zod schema generation with tags mode.
---

# Orval codegen configuration

## The rule
Zod output must use `mode: "tags"` with `target: "generated/api.ts"` (not `split` mode with `schemas`).

**Why:** `mode: "split"` with `schemas: { path: "generated/types", type: "typescript" }` generates both Zod schemas AND TypeScript type files, causing duplicate exports and TS2307 errors. Tags mode generates one file per OpenAPI tag (e.g. `exchange.ts`, `audit-logs.ts`).

## How to apply
- `lib/api-zod/src/index.ts` must manually export from each generated tag file:
  ```ts
  export * from "./generated/audit-logs";
  export * from "./generated/backtests";
  export * from "./generated/exchange";
  // ... etc
  ```
- After adding new tags to the OpenAPI spec, add a new export line to `index.ts`.
- Run `pnpm --filter @workspace/api-spec run codegen` after any spec changes.
