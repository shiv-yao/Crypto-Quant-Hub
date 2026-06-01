---
name: API server dependencies
description: Packages that must be listed in api-server/package.json dependencies for esbuild bundling.
---

# API server esbuild dependency requirements

## The rule
Any package imported directly in `artifacts/api-server/src/**` must be listed in `artifacts/api-server/package.json` under `dependencies` — even if it's hoisted from the workspace root.

**Why:** esbuild bundles the API server from source. It resolves imports relative to the package's own `node_modules`, not the workspace root. Packages only available via hoisting are not reliably found.

## How to apply
Use `"catalog:"` for packages that have catalog entries in `pnpm-workspace.yaml`:
```json
"dependencies": {
  "zod": "catalog:",
  "drizzle-orm": "catalog:"
}
```

Key packages that needed explicit listing: `zod` (when used directly in route files).
