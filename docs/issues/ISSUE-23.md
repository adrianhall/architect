# Upgrade TypeScript from 5.8 to 6.0

## Summary

TypeScript 6.0 is a major version that deprecates legacy module systems (AMD,
UMD, SystemJS), the `moduleResolution: node` alias, `baseUrl`, `outFile`, and
`target: es5`.  It also changes three important defaults that must be audited:
`types: []` (no longer auto-includes all `@types/*`), `rootDir: .` (no longer
inferred from source files), and `noUncheckedSideEffectImports: true` (errors on
side-effect imports of missing modules).  This project is already well-positioned
for the upgrade because it explicitly sets `strict`, `target`, `module`,
`moduleResolution`, `esModuleInterop`, and `rootDir` in every workspace tsconfig.

This issue was triaged during ISSUE-03 as part of a package-dependency audit.

## Relevant Skills

- `typescript-advanced-types`
- `workers-best-practices`
- `cloudflare`

## Requirements Coverage

No direct user-facing requirements.  This is a tooling/quality improvement that
reduces technical debt and prepares the project for TypeScript 7 (the native
port).

## Dependencies

- Should be done **after ISSUE-04** so that the auth middleware is in place and
  the full worker source is compilable.  Upgrading TypeScript while large
  sections of the project are still stubs risks misleading type-check results.

## Acceptance Criteria

- [ ] `typescript` is upgraded to `^6.0.3` (or latest stable 6.x) at the root.
- [ ] All workspace `tsconfig.json` files have explicit `types` arrays so the new
  default `types: []` does not silently drop needed globals.
- [ ] No TypeScript deprecation warnings are emitted by `tsc -b`.
- [ ] `npm run check` passes (types, biome, markdown, infra).
- [ ] `npm test` passes with all 38+ tests (test count will grow as later issues
  are implemented).
- [ ] `npm run build` builds all artifacts without errors.

## Technical Approach

### Step 1 — Audit current tsconfig files against TS6 breaking changes

Before installing, verify the status of each breaking change:

| TS6 change | Our setting | Impact |
|------------|-------------|--------|
| `strict: true` default | Already explicit in all configs | None |
| `module: esnext` default | Explicit `ES2022` in all configs | None |
| `target: es2025` floating default | Explicit `ES2022` in all configs | None |
| `rootDir: .` default (no longer inferred) | Explicit `rootDir: "src"` in all workspace configs | None |
| `types: []` default | **Worker**: explicit `["@cloudflare/workers-types", "@cloudflare/vitest-pool-workers/types"]` ✓; **Shared**: no explicit `types` field — must audit; **Frontend**: no explicit `types` field — must audit | Shared/frontend need checking |
| `noUncheckedSideEffectImports: true` default | None currently set | Must scan for bare side-effect imports |
| `moduleResolution: node` deprecated | We use `bundler` | None |
| `esModuleInterop: false` deprecated | Explicit `true` in all configs | None |
| `baseUrl` deprecated | Not used | None |
| `outFile` deprecated | Not used | None |
| `target: es5` deprecated | Not used | None |
| `downlevelIteration` deprecated | Not used | None |
| `module: amd/umd/systemjs` deprecated | Not used | None |
| `module namespace {}` syntax deprecated | Not used | None |

### Step 2 — Install TypeScript 6

```bash
npm install --save-dev typescript@^6.0.3
```

### Step 3 — Run `tsc -b --noEmit` and fix all errors

Run `npm run check:types` and address each failure. The expected categories are:

Category a — Missing `types` array in shared/frontend tsconfigs:

If TS6 can no longer find types that were previously auto-discovered, add an
explicit `"types": []` (or the specific packages needed) to the affected
tsconfig. The shared package is pure TypeScript types and should need nothing.
The frontend uses React types via import, not globals, so it may also need
nothing — but verify.

Category b — `noUncheckedSideEffectImports` catching missing imports:

Scan for any bare `import "./something"` or `import "some-module"` statements.
If they exist and cannot be resolved, either fix the import or set
`"noUncheckedSideEffectImports": false` with a comment explaining why.

Category c — Newly-deprecated options producing errors:

TS6 makes some previously-warn-only options into hard errors. Grep for any
option the migration guide calls out and verify it is not present in any
tsconfig or `tsc` call.

Category d — `--ignoreDeprecations "6.0"` as an escape hatch:

If any deprecated feature is actively used by a third-party package or
integration that cannot yet be updated, add `"ignoreDeprecations": "6.0"` to
the relevant tsconfig as a temporary measure and file a follow-up to remove it.

### Step 4 — Run `npm run fix && npm run check && npm test`

All three must pass with zero errors.

### Step 5 — Update `docs/DECISIONS.md`

Record which deprecated options (if any) required `ignoreDeprecations`, and why.

## Testing

No new tests are introduced by this issue.  The quality gates (`check:types`,
`check:biome`, `npm test`) are the verification mechanism.

## Manual Tests

| Step | Command | Expected Result |
|------|---------|-----------------|
| 1 | `npm install` | TypeScript 6.x installed |
| 2 | `npm run check` | All checks pass with zero warnings |
| 3 | `npm test` | All tests pass |
| 4 | `npx tsc --version` | Reports `Version 6.x.x` |
