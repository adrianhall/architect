# Project scaffolding: workspaces, Biome, TS, Vitest projects

## Summary

Set up the entire monorepo foundation: npm workspaces for `src/worker`, `src/frontend`, and `src/shared`; Biome for linting and formatting; TypeScript with project references; Vitest with the projects pattern; and stub files for all three workspace packages. This issue produces a repo where `npm install`, `npm run check`, and `npm test` all pass on a clean checkout — establishing the quality gates every subsequent issue builds on.

## Relevant Skills

- `cloudflare`
- `cloudflare-scripts`
- `typescript-advanced-types`
- `wrangler`
- `workers-best-practices`

## Requirements Coverage

- [F1-US1](../REQUIREMENTS.md) (partial) — Structured foundation: workspaces, shared types package, and quality tooling are the structural prerequisite for structured logging and every other feature.
- [F1-US4](../REQUIREMENTS.md) (partial) — Repeatable deployment: the workspace layout and script conventions that `provision` and `deploy` will plug into are established here.

## Dependencies

None — this is the first issue.

## Acceptance Criteria

- [ ] `npm install` succeeds and creates `node_modules` with workspace symlinks for `src/worker`, `src/frontend`, and `src/shared`.
- [ ] `npm run check:types` passes (`tsc -b --noEmit`).
- [ ] `npm run check:biome` passes (`biome check .`).
- [ ] `npm run check:markdown` passes (`markdownlint-cli2 'docs/*.md' 'docs/issues/*.md' '#node_modules'`).
- [ ] `npm run check` runs all three checks sequentially and passes.
- [ ] `npm run fix:biome` applies formatting fixes without errors.
- [ ] `npm test` runs Vitest across both projects (worker and frontend) and passes (placeholder tests).
- [ ] `npm run test:worker` runs only worker project tests.
- [ ] `npm run test:frontend` runs only frontend project tests.
- [ ] `npm run test:coverage` runs with coverage and reports > 90% for new files.
- [ ] `npm run build` succeeds (runs `tsc -b`).
- [ ] `.env.example` exists with documented variables.
- [ ] All workspace `package.json` files have `"type": "module"`.
- [ ] `src/shared/src/index.ts` re-exports from `diagram.ts`, `catalog.ts`, `api.ts`, and `user.ts`.
- [ ] **Note:** `npm start` is NOT expected to work after this issue (no `wrangler.jsonc` yet — that comes in ISSUE-02).

## Technical Approach

### Step 1 — Update root `package.json`

Edit `/package.json` to add workspaces, new scripts, and new devDependencies. **Preserve** the existing `markdownlint-cli2` and `npm-run-all2` devDependencies and the `check` script pattern.

```jsonc
{
  "name": "architect",
  "version": "1.0.0",
  "description": "A web app for designing Cloudflare system architectures",
  "license": "MIT",
  "private": true,
  "type": "module",
  "workspaces": [
    "src/shared",
    "src/worker",
    "src/frontend"
  ],
  "scripts": {
    "build": "tsc -b",
    "check": "run-s check:*",
    "check:biome": "biome check .",
    "check:markdown": "markdownlint-cli2 'docs/**/*.md' 'docs/issues/*.md' '#node_modules'",
    "check:types": "tsc -b --noEmit",
    "fix": "run-s fix:*",
    "fix:biome": "biome check --write .",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:worker": "vitest run --project worker",
    "test:frontend": "vitest run --project frontend"
  },
  "devDependencies": {
    "@biomejs/biome": "2.0.6",
    "@vitest/coverage-v8": "3.2.1",
    "markdownlint-cli2": "0.22.1",
    "npm-run-all2": "9.0.1",
    "typescript": "5.8.3",
    "vitest": "3.2.1"
  }
}
```

> **Key points:**
>
> - `check` uses `run-s check:*` which runs all `check:*` scripts in alphabetical order.
> - `build` at root level runs `tsc -b` which follows project references.
> - Vitest version and coverage provider must be compatible.

### Step 2 — Create `biome.json`

Create `/biome.json` at the repo root:

```json
{
  "$schema": "https://biomejs.dev/schemas/2.0.6/schema.json",
  "vcs": {
    "enabled": true,
    "clientKind": "git",
    "useIgnoreFile": true
  },
  "organizeImports": {
    "enabled": true
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true
    }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "tab",
    "lineWidth": 120
  },
  "files": {
    "ignore": [
      "node_modules",
      "dist",
      ".wrangler",
      "coverage",
      "*.d.ts",
      "infra"
    ]
  }
}
```

### Step 3 — Create root `tsconfig.json`

Create `/tsconfig.json` with project references pointing to all three workspaces:

```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "declaration": true,
    "declarationMap": true,
    "composite": true,
    "noEmit": true
  },
  "references": [
    { "path": "src/shared" },
    { "path": "src/worker" },
    { "path": "src/frontend" }
  ],
  "include": []
}
```

### Step 4 — Create root `vitest.config.ts`

Create `/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: ["src/worker", "src/frontend"],
  },
});
```

### Step 5 — Create `src/shared/` workspace

#### `src/shared/package.json`

```json
{
  "name": "@architect/shared",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "default": "./src/index.ts"
    }
  }
}
```

#### `src/shared/tsconfig.json`

```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "declaration": true,
    "declarationMap": true,
    "composite": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

#### `src/shared/src/diagram.ts`

```ts
// Diagram types — populated in ISSUE-03
export {};
```

#### `src/shared/src/catalog.ts`

```ts
// Service catalog types — populated in a later issue
export {};
```

#### `src/shared/src/api.ts`

```ts
// API envelope types — populated in ISSUE-03
export {};
```

#### `src/shared/src/user.ts`

```ts
// User role types — populated in ISSUE-03
export {};
```

#### `src/shared/src/index.ts`

```ts
export * from "./diagram.js";
export * from "./catalog.js";
export * from "./api.js";
export * from "./user.js";
```

> **Note:** Use `.js` extensions in imports per ESM convention — TypeScript resolves these to `.ts` files during compilation.

### Step 6 — Create `src/worker/` workspace

#### `src/worker/package.json`

```json
{
  "name": "@architect/worker",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run"
  },
  "dependencies": {
    "@architect/shared": "*"
  }
}
```

#### `src/worker/tsconfig.json`

```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "declaration": true,
    "declarationMap": true,
    "composite": true,
    "outDir": "dist",
    "rootDir": "src",
    "types": ["@cloudflare/workers-types"]
  },
  "include": ["src"],
  "references": [
    { "path": "../shared" }
  ]
}
```

> **Note:** The `@cloudflare/workers-types` reference will cause a type-check warning until ISSUE-02 installs wrangler (which bundles the types). For this issue, install `@cloudflare/workers-types` as a devDependency to keep `tsc -b` clean:
>
> ```bash
> npm install --save-dev @cloudflare/workers-types --workspace=src/worker
> ```

#### `src/worker/src/index.ts`

```ts
// Worker entry point — Hono app created in a later issue
export default {
  async fetch(_request: Request, _env: unknown, _ctx: ExecutionContext): Promise<Response> {
    return new Response("CF-Architect API — not yet implemented", { status: 200 });
  },
};
```

#### `src/worker/vitest.config.ts`

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "worker",
    include: ["src/**/*.test.ts"],
  },
});
```

> **Note:** This uses the standard Vitest environment for now. When `wrangler.jsonc` exists (after ISSUE-02), this will be migrated to `@cloudflare/vitest-pool-workers`. That migration is out of scope for this issue.

#### `src/worker/src/index.test.ts`

Create a placeholder test to validate the project wiring:

```ts
import { describe, expect, it } from "vitest";

describe("worker entry", () => {
  it("should export a default fetch handler", async () => {
    const mod = await import("./index.js");
    expect(mod.default).toBeDefined();
    expect(mod.default.fetch).toBeInstanceOf(Function);
  });
});
```

### Step 7 — Create `src/frontend/` workspace

#### `src/frontend/package.json`

```json
{
  "name": "@architect/frontend",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run"
  },
  "dependencies": {
    "@architect/shared": "*"
  }
}
```

#### `src/frontend/tsconfig.json`

```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "declaration": true,
    "declarationMap": true,
    "composite": true,
    "jsx": "react-jsx",
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"],
  "references": [
    { "path": "../shared" }
  ]
}
```

#### `src/frontend/src/main.tsx`

```tsx
// Frontend entry point — React app created in a later issue
export function App() {
  return <div>CF-Architect — not yet implemented</div>;
}
```

#### `src/frontend/vitest.config.ts`

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "frontend",
    environment: "jsdom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
```

#### `src/frontend/src/main.test.tsx`

Create a placeholder test:

```tsx
import { describe, expect, it } from "vitest";
import { App } from "./main.js";

describe("frontend entry", () => {
  it("should export an App component", () => {
    expect(App).toBeInstanceOf(Function);
  });
});
```

> **Note:** Install `jsdom` as a devDependency at the root or in the frontend workspace:
>
> ```bash
> npm install --save-dev jsdom --workspace=src/frontend
> ```

### Step 8 — Create `.env.example`

Create `/.env.example`:

```bash
# Cloudflare account and API credentials
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_API_TOKEN=

# Cloudflare Access team domain (e.g., "mycompany" for mycompany.cloudflareaccess.com)
CLOUDFLARE_TEAM_DOMAIN=

# Email address for the initial admin user (seeded on first deploy)
SEED_ADMIN_EMAIL=

# Worker name (used in Terraform and wrangler config)
TF_VAR_worker_name=cf-architect
```

### Step 9 — Install dependencies and verify

Run the following commands in order:

```bash
npm install
npm run check:types
npm run check:biome
npm run check:markdown
npm run check
npm test
npm run test:coverage
npm run build
```

Fix any issues surfaced by these commands before considering the issue complete.

### Step 10 — Fix Biome formatting

After all files are created, run `npm run fix:biome` to auto-format everything to match the Biome config. Then re-run `npm run check` to confirm all checks pass.

## Testing

### Unit Tests

| File | What it tests |
|------|---------------|
| `src/worker/src/index.test.ts` | Worker module exports a default fetch handler |
| `src/frontend/src/main.test.tsx` | Frontend module exports an App component |

These are intentionally minimal — they exist to validate the Vitest project wiring (correct test environments, workspace resolution, project filtering via `--project`).

### Manual Tests

| Step | Command | Expected Result |
|------|---------|-----------------|
| 1 | `npm install` | Installs all dependencies; workspace symlinks created |
| 2 | `npm run check` | All checks pass (types, biome, markdown) |
| 3 | `npm test` | Both project suites run and pass |
| 4 | `npm run test:worker` | Only worker tests run |
| 5 | `npm run test:frontend` | Only frontend tests run |
| 6 | `npm run test:coverage` | Coverage report generated, > 90% on new files |
| 7 | `npm run build` | TypeScript build succeeds |
| 8 | `npm run fix:biome` | No errors, files formatted |
