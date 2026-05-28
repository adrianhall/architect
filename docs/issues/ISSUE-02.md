# Terraform infrastructure + deployment pipeline

## Summary

Create the Terraform infrastructure-as-code and npm script pipeline that provisions all Cloudflare resources (Worker, D1 database), generates `wrangler.jsonc` from Terraform outputs, and wires up the full deployment lifecycle (`provision`, `deploy`, `start`, `teardown`). After this issue, `npm run provision` creates real infrastructure, `npm start` launches a local dev server, and `npm run deploy` ships code to production.

## Relevant Skills

- `cloudflare`
- `cloudflare-scripts`
- `wrangler`
- `workers-best-practices`

## Requirements Coverage

- [F1-US4](../REQUIREMENTS.md) — Repeatable provisioning: `npm run provision` provisions all Cloudflare resources with Terraform from a fresh account with a single API token.
- [F1-US5](../REQUIREMENTS.md) — Idempotent deploy: `npm run deploy` is idempotent and applies pending schema migrations before deploying (migration scripts wired here, actual migrations come in ISSUE-03).
- [F1-US6](../REQUIREMENTS.md) — Local development: `npm start` runs the code locally via `wrangler dev`.

## Dependencies

- **ISSUE-01** — Workspace structure, root `package.json` scripts, `tsconfig.json`, `.env.example`.

## Acceptance Criteria

- [ ] `infra/terraform.tf` declares `cloudflare` v5 and `jrhouston/dotenv` providers with required versions.
- [ ] `infra/main.tf` creates a `cloudflare_worker` resource and a `cloudflare_d1_database` resource with `read_replication` block.
- [ ] `infra/outputs.tf` exports all values needed by `generate-wrangler` as string outputs.
- [ ] `src/worker/wrangler.jsonc.tpl` is a valid template with `{{placeholder}}` syntax for all dynamic values, including `assets` config with `run_worker_first`, `binding`, and `not_found_handling`.
- [ ] `npm run provision` runs `terraform init` then `terraform apply` then `generate-wrangler` and produces a valid `src/worker/wrangler.jsonc`.
- [ ] `npm run deploy` generates types, builds frontend (no-op at this stage), runs migrations (no-op), and runs `wrangler deploy`.
- [ ] `npm start` generates types, builds frontend (no-op), and starts `wrangler dev`.
- [ ] `npm run teardown` destroys Terraform resources and removes generated files.
- [ ] `npm run generate:types` produces `src/worker/worker-configuration.d.ts`.
- [ ] `npm run check` passes (including `check:infra` — terraform validate).
- [ ] `npm run build` builds all artifacts.
- [ ] `npm test` passes.
- [ ] `npm start` builds and starts the service without errors (after provisioning).

## Technical Approach

### Step 1 — Install devDependencies

Add the following devDependencies to the **root** `package.json`:

```bash
npm install --save-dev @adrianhall/cloudflare-scripts wrangler shx
```

> **Important:** `wrangler` is installed at the root so all `wrangler` commands in root scripts resolve correctly. `@adrianhall/cloudflare-scripts` provides `generate-wrangler` and `generate-types` CLI commands. `shx` provides cross-platform `rm` for the `postteardown` script.

### Step 2 — Create Terraform files

#### `infra/terraform.tf`

Create the directory `infra/` and the file `infra/terraform.tf`:

```hcl
terraform {
  required_version = ">= 1.0"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
    dotenv = {
      source  = "jrhouston/dotenv"
      version = "~> 1.0"
    }
  }
}
```

#### `infra/main.tf`

```hcl
data "dotenv" "env" {
  filename = "../.env"
}

locals {
  account_id   = data.dotenv.env.entries.CLOUDFLARE_ACCOUNT_ID
  worker_name  = data.dotenv.env.entries.TF_VAR_worker_name
  team_domain  = data.dotenv.env.entries.CLOUDFLARE_TEAM_DOMAIN
  admin_email  = data.dotenv.env.entries.SEED_ADMIN_EMAIL
}

provider "cloudflare" {
  api_token = data.dotenv.env.entries.CLOUDFLARE_API_TOKEN
}

resource "cloudflare_worker" "app" {
  account_id = local.account_id
  script_name = local.worker_name
  main_module = "index.js"
  compatibility_date = "2025-05-26"
  content = "export default { fetch() { return new Response('placeholder') } }"
}

resource "cloudflare_d1_database" "main" {
  account_id = local.account_id
  name       = "${local.worker_name}-db"

  read_replication {
    mode = "auto"
  }
}
```

> **CRITICAL notes:**
>
> - Use `cloudflare_worker` (NOT `cloudflare_workers_script`) — this is the v5 provider resource.
> - The `cloudflare_worker` resource requires a `content` field with placeholder JavaScript and a `main_module` field. The actual code is deployed by `wrangler deploy` separately.
> - The D1 resource **must** include the `read_replication` block — omitting it causes drift on every apply.

#### `infra/outputs.tf`

All outputs must be **strings** for `generate-wrangler` compatibility:

```hcl
output "account_id" {
  value = local.account_id
}

output "worker_name" {
  value = cloudflare_worker.app.script_name
}

output "d1_database_id" {
  value = cloudflare_d1_database.main.id
}

output "d1_database_name" {
  value = cloudflare_d1_database.main.name
}

output "CLOUDFLARE_TEAM_DOMAIN" {
  value = local.team_domain
}

output "SEED_ADMIN_EMAIL" {
  value     = local.admin_email
  sensitive = true
}
```

### Step 3 — Create `wrangler.jsonc.tpl`

Create `src/worker/wrangler.jsonc.tpl`:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "{{worker_name}}",
  "main": "src/index.ts",
  "compatibility_date": "2025-05-26",
  "account_id": "{{account_id}}",
  "assets": {
    "directory": "public",
    "binding": "ASSETS",
    "run_worker_first": true,
    "not_found_handling": "single-page-application"
  },
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "{{d1_database_name}}",
      "database_id": "{{d1_database_id}}"
    }
  ],
  "vars": {
    "CLOUDFLARE_TEAM_DOMAIN": "{{CLOUDFLARE_TEAM_DOMAIN}}",
    "SEED_ADMIN_EMAIL": "{{SEED_ADMIN_EMAIL}}"
  },
  "observability": {
    "enabled": true
  }
}
```

> **Key points:**
>
> - `{{placeholder}}` values are replaced by `generate-wrangler` using Terraform output names.
> - `assets.directory` is `"public"` — the frontend build output directory (Vite will be configured to output here in a later issue). Create `src/worker/public/` with a placeholder `index.html` so `wrangler dev` doesn't error on missing assets directory.
> - `run_worker_first: true` is required by `@adrianhall/cloudflare-auth`.
> - `not_found_handling: "single-page-application"` enables SPA client-side routing.

#### Create placeholder `src/worker/public/index.html`

```html
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>CF-Architect</title></head>
<body><p>CF-Architect — frontend not yet built.</p></body>
</html>
```

### Step 4 — Update root `package.json` scripts

Add/update the following scripts in the root `package.json`. **Preserve** all existing scripts from ISSUE-01. The final scripts object should include:

```jsonc
{
  "scripts": {
    "build": "run-s generate:types build:frontend",
    "build:frontend": "npm run build --workspace=src/frontend",
    "check": "run-s check:*",
    "check:biome": "biome check .",
    "check:infra": "terraform -chdir=infra validate",
    "check:markdown": "markdownlint-cli2 'docs/**/*.md' '#node_modules'",
    "check:types": "tsc -b --noEmit",
    "db:migrate:local": "npm run db:migrate:local --workspace=src/worker",
    "db:migrate:remote": "npm run db:migrate:remote --workspace=src/worker",
    "deploy": "wrangler deploy --config src/worker/wrangler.jsonc",
    "fix": "run-s fix:*",
    "fix:biome": "biome check --write .",
    "fix:infra": "terraform -chdir=infra fmt",
    "generate:types": "generate-types -d src/worker -- --include-runtime=false --strict-vars=false",
    "postprovision": "generate-wrangler -cf -d src/worker -t infra",
    "postteardown": "shx rm -f src/worker/wrangler.jsonc src/worker/worker-configuration.d.ts",
    "predeploy": "run-s generate:types build:frontend db:migrate:remote",
    "preprovision": "terraform -chdir=infra init",
    "prestart": "run-s generate:types build:frontend",
    "provision": "terraform -chdir=infra apply -auto-approve",
    "start": "run-s start:worker",
    "start:frontend": "npm run dev --workspace=src/frontend",
    "start:worker": "wrangler dev --config src/worker/wrangler.jsonc",
    "teardown": "terraform -chdir=infra destroy -auto-approve",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage",
    "test:frontend": "vitest run --project frontend",
    "test:watch": "vitest",
    "test:worker": "vitest run --project worker"
  }
}
```

> **Note:** The `build` script changes from ISSUE-01's `tsc -b` to `run-s generate:types build:frontend`. This is the correct build pipeline going forward. The `check:types` script still runs `tsc -b --noEmit` for type-checking without emitting files.
>
> **Note:** `build:frontend` will be a no-op/error until the frontend workspace has a `build` script (configured in a later issue). For now, add a placeholder `build` script to `src/frontend/package.json`:
>
> ```json
> "scripts": {
>   "build": "echo 'Frontend build not yet configured'",
>   "test": "vitest run"
> }
> ```
>
> **Note:** Similarly, `db:migrate:local` and `db:migrate:remote` delegate to workspace scripts that don't exist yet. Add placeholder scripts to `src/worker/package.json`:
>
> ```json
> "scripts": {
>   "db:migrate:local": "echo 'No migrations yet'",
>   "db:migrate:remote": "echo 'No migrations yet'",
>   "test": "vitest run"
> }
> ```

### Step 5 — Update `.gitignore`

Ensure the `.gitignore` already covers (it should from the initial setup):

- `wrangler.jsonc` — generated, never committed
- `worker-configuration.d.ts` — generated, never committed
- `.wrangler/` — local state
- `**/.terraform/*` — provider cache
- `*.tfstate` / `*.tfstate.*` — state files

Also add `src/worker/public/` to `.gitignore` if it will be the frontend build output. However, since we need the placeholder `index.html` to be committed for `wrangler dev` to work before the frontend is built, do **not** gitignore the public directory yet. The placeholder `index.html` will be overwritten by the Vite build in a later issue. At that point, a `.gitkeep` or build-time creation can replace it.

### Step 6 — Verify the pipeline

After creating all files, run the following verification steps:

```bash
# 1. Verify all checks pass
npm run check

# 2. Verify tests still pass
npm test

# 3. Verify generate:types works (requires wrangler.jsonc to exist - skip if not provisioned)
# npm run generate:types

# 4. If you have credentials in .env, test the full provision flow:
# npm run provision
# npm run generate:types
# npm start
```

### Step 7 — Handle `check:infra` gracefully

The `check:infra` script (`terraform -chdir=infra validate`) requires `terraform init` to have been run first (providers must be downloaded). This is documented in MVP_PLAN.md Section 6:

> `check:infra` requires terraform providers to be initialized. Run `npm run preprovision` (or `terraform -chdir=infra init -backend=false`) once before using `npm run check`.

Since `check` runs `run-s check:*` and `check:infra` comes alphabetically before `check:markdown`, if terraform isn't initialized, `check` will fail. This is acceptable — the developer must run `preprovision` once per checkout. Document this in `.env.example` or a comment in the root `package.json`.

If this is too aggressive for CI where Terraform credentials may not be available, consider making `check:infra` a separate script not in the `check:*` glob. One option: rename to `validate:infra` so it's excluded from the `check:*` pattern. **Recommended approach:** keep `check:infra` in the glob but document the prerequisite. This matches the MVP_PLAN.md design.

## Testing

### Unit Tests

No new unit tests are introduced in this issue — the infrastructure is validated by the pipeline commands themselves. The existing tests from ISSUE-01 must continue to pass.

### Manual Tests

| Step | Command | Expected Result |
|------|---------|-----------------|
| 1 | `npm install` | New devDependencies installed (`@adrianhall/cloudflare-scripts`, `wrangler`, `shx`) |
| 2 | `npm run check:types` | TypeScript compiles without errors |
| 3 | `npm run check:biome` | Biome passes on all files |
| 4 | `npm test` | All existing tests pass |
| 5 | Copy `.env.example` to `.env`, fill in credentials | `.env` file ready |
| 6 | `npm run provision` | Terraform creates Worker + D1 database; `wrangler.jsonc` generated in `src/worker/` |
| 7 | `cat src/worker/wrangler.jsonc` | All `{{placeholders}}` replaced with real values |
| 8 | `npm run generate:types` | `src/worker/worker-configuration.d.ts` generated |
| 9 | `npm start` | Wrangler dev server starts, serves placeholder page at `http://localhost:8787` |
| 10 | `npm run teardown` | Terraform destroys resources; `wrangler.jsonc` and `worker-configuration.d.ts` removed |
