# Decisions Log

Architectural and implementation decisions that deviate from or extend the original issue specifications.

---

## ISSUE-01 — Project scaffolding

### Remove `noEmit: true` from root `tsconfig.json` compilerOptions

**Decision:** The issue spec included `"noEmit": true` in the root `tsconfig.json` compilerOptions alongside `"composite": true`. In TypeScript 5.x, this combination causes error TS6310 ("Referenced project may not disable emit") when a project with `composite: true` is referenced by another and the parent has `noEmit: true` statically set.

**Resolution:** Removed `"noEmit": true` from the static config. The `--noEmit` flag on the CLI (`tsc -b --noEmit`) is sufficient and does not trigger TS6310.

### Add `generate:types` pre-script for `check:types`

**Decision:** On a clean checkout (no `dist/` folders), `tsc -b --noEmit` fails with TS6310 because declaration files for referenced projects don't yet exist. Added `generate:types` (`tsc -b`) as a `precheck:types` lifecycle script so `npm run check:types` always works from a clean state.

### Add `clean` / `clean:dist` scripts using `rimraf`

**Decision:** Added `rimraf src/*/dist src/*/*.tsbuildinfo` as `clean:dist` under a top-level `clean` script (run-s pattern) to support clean-state testing and CI workflows. `rimraf` added as a root devDependency.

### Update `biome.json` for Biome v2 breaking changes

**Decision:** The issue spec used Biome v1 config keys that were removed in v2.0.6:

- `organizeImports` (top-level) → `assist.actions.source.organizeImports: "on"`
- `files.ignore` → `files.includes` with negation globs (`"!**/*.d.ts"`, `"!infra/**"`)

Since `vcs.useIgnoreFile: true` already excludes `.gitignore` entries (`node_modules`, `dist`, `.wrangler`, `coverage`), the `files.includes` array only needs the entries not covered by `.gitignore`.

### Install `react` and `react-dom` in frontend workspace

**Decision:** The issue spec only mentioned `jsdom` as a devDependency for the frontend workspace. However, `"jsx": "react-jsx"` requires the `react` runtime package (specifically `react/jsx-dev-runtime`) to be resolvable at test time. Added `react` and `react-dom` as runtime dependencies and `@types/react` / `@types/react-dom` as devDependencies in `src/frontend`.

### Scope coverage to `src/worker/src` and `src/frontend/src` only

**Decision:** Without explicit coverage configuration, Vitest v3 includes `dist/` build artifacts and `src/shared/src` stub files (all `export {}`), making the coverage table noisy and misleading. Added `coverage.include`/`exclude` to both workspace vitest configs and a root-level `coverage.provider: "v8"` with matching includes. Result: only the files with real implementation appear in the report, both at 100%.

### Extend placeholder tests to invoke actual code paths

**Decision:** The original placeholder tests only checked that exports existed (`expect(fn).toBeInstanceOf(Function)`), leaving the function bodies uncovered. Added one additional test per file that calls the fetch handler / renders the App component, achieving 100% coverage on both new source files.
