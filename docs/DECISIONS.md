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

---

## ISSUE-02 — Terraform infrastructure + deployment pipeline

### `cloudflare_worker` v5 attribute corrections

**Decision:** The issue spec specified `cloudflare_worker` with `script_name`, `main_module`, `compatibility_date`, and `content` attributes. Per the Cloudflare v5 Terraform provider docs and the IaC guide, `cloudflare_worker` uses `name` (not `script_name`) and does not accept `main_module`, `compatibility_date`, or `content`. Those attributes belong to `cloudflare_workers_script` or `cloudflare_worker_version`.

**Resolution:** Used `cloudflare_worker` with only `account_id` and `name`. Terraform registers the worker name; Wrangler deploys the actual code. `outputs.tf` references `cloudflare_worker.app.name` (not `.script_name`). This matches the cloudflare-scripts skill's canonical pattern.

### dotenv provider attribute is `.env`, not `.entries`

**Decision:** The issue spec used `data.dotenv.env.entries.VARIABLE` to access `.env` file values. Per the jrhouston/dotenv provider source code (confirmed from `data_source_dotenv.go`), the exported attribute is `env` (a TypeMap), not `entries`. Accessing individual values requires `data.dotenv.env.env.VARIABLE_NAME`.

**Resolution:** Used `data.dotenv.env.env.VARIABLE` throughout `infra/main.tf`. The issue spec attribute name would cause `terraform validate` to fail with an "unsupported argument" error.

### `precheck:types` decoupled from `generate:types`

**Decision:** ISSUE-01 set `precheck:types: "npm run generate:types"` to ensure TypeScript declaration files exist before type checking. In ISSUE-02, `generate:types` changes meaning from `tsc -b` to `generate-types -d src/worker -- ...` (which generates `worker-configuration.d.ts` from `wrangler.jsonc`). Running this as a pre-step for `check:types` would fail on a clean checkout without provisioned infrastructure.

**Resolution:** Changed `precheck:types` to `tsc -b` directly, preserving the ISSUE-01 behavior of building workspace declaration files before type checking, without requiring a provisioned `wrangler.jsonc`.

### `npm run build` requires provisioned infrastructure

**Decision:** The new `build` script (`run-s generate:types build:frontend`) invokes `generate-types` which requires `wrangler.jsonc` to exist. On a clean checkout without `npm run provision`, `npm run build` exits with code 1. This is expected and documented behavior — the generate-types tool explicitly instructs: "Run `npm run provision` to provision infrastructure and generate it."

**Resolution:** This is by design. The deployment workflow documented in `MVP_PLAN.md` requires provisioning before building. No change was made; the behavior matches the workflow intent.

### `@adrianhall/cloudflare-scripts` installed from GitHub `main`

**Decision:** The cloudflare-scripts skill referenced tag `v1.0.2` which did not exist on the GitHub repo at implementation time (only `v1.0.1` and `1.0.0` were released tags). The `main` branch contains version `1.0.2` code.

**Resolution:** Installed from `github:adrianhall/cloudflare-scripts` (main branch). The `package.json` devDependency is pinned to the GitHub source. Once a `v1.0.2` tag is released, the reference should be updated to `github:adrianhall/cloudflare-scripts#v1.0.2`.

---

## ISSUE-02 amendment — Cloudflare Access resources

### Separate `cloudflare_zero_trust_access_policy` and `cloudflare_zero_trust_access_application` resources

**Decision:** Added two new Terraform resources to protect the Worker with Cloudflare Access. Per the user's requirement, resources are kept separate (not embedded) because embedded policies in the Access application are deprecated in the v5 provider.

- **`cloudflare_zero_trust_access_policy.allow_idp`** — Account-level, reusable policy. `decision = "allow"` with a single `include` rule using `login_method.id = local.idp_id`. This allows any user who successfully authenticates through the configured IdP, regardless of email domain.
- **`cloudflare_zero_trust_access_application.app`** — Self-hosted application protecting `${worker_name}.${workers_domain}`. Uses `account_id` (not `zone_id`) because workers.dev is an account-level domain, not a zone. Sets `allowed_idps = [local.idp_id]` to restrict the login screen to the configured IdP and `auto_redirect_to_identity = true` to skip the Cloudflare Access landing page. Links to the policy via `policies = [{ id = ..., precedence = 1 }]`.

**New `.env` variables consumed:** `CLOUDFLARE_IDP_ID` (IdP UUID) and `CLOUDFLARE_WORKERS_DOMAIN` (e.g., `abc123.workers.dev`) — both added to `locals` in `main.tf`. Both were already documented in the updated `.env.example`.

**Verified:** `npm run provision` created all 4 resources (worker, D1 database, Access policy, Access application) successfully. `terraform plan` on a second run shows "No changes" — fully idempotent.
