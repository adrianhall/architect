# AGENTS.md — Guidance for AI Agents

This file describes how AI agents should work in this repository: which commands
are pre-approved, how to research unfamiliar APIs, and what is explicitly off-limits
without human approval.

---

## Permitted npm scripts

All scripts in `package.json` may be run freely without asking for approval.
Run them from the **repo root** unless the table says otherwise.

| Script | What it does |
|--------|--------------|
| `npm install` | Install dependencies and create workspace symlinks |
| `npm run build` | Emit TypeScript declaration files for all workspaces (`tsc -b`) |
| `npm run generate:types` | Same as `build`; also runs automatically before `check:types` |
| `npm run clean` | Delete all `dist/` folders and `.tsbuildinfo` files |
| `npm run clean:dist` | Same as `clean` (only sub-task currently) |
| `npm run check` | Run all checks sequentially: biome → markdown → types |
| `npm run check:biome` | Lint and format check with Biome |
| `npm run check:markdown` | Lint all Markdown files in `docs/` |
| `npm run check:types` | TypeScript project-reference type check (`tsc -b --noEmit`) |
| `npm run fix` | Run all auto-fixers sequentially |
| `npm run fix:biome` | Apply Biome safe fixes and formatting in-place |
| `npm test` | Run all Vitest suites across worker and frontend projects |
| `npm run test:watch` | Run Vitest in watch mode |
| `npm run test:coverage` | Run tests with v8 coverage; report scoped to `src/*/src/` |
| `npm run test:worker` | Run only the worker Vitest project |
| `npm run test:frontend` | Run only the frontend Vitest project |

> **Workflow rule:** After making changes, always run `npm run fix && npm run check`
> to verify correctness before committing. Run `npm test` whenever worker or
> frontend source files are modified.

You are also allowed to use `npm info`, `npm version`, `npm view` and `npm docs` to get more information about npm packages.

---

## Research methodology

**Prefer WebFetch over package inspection.** Reading documentation pages is
faster, more accurate, and does not require pre-approval. Trawling through files
inside `node_modules` with Node.js scripts or shell one-liners is prohibited
without explicit approval (see below).

When you are unsure about an API, configuration option, or CLI flag, fetch the
relevant documentation page first. The documentation sources below are the
authoritative references for this project.

### Documentation sources

| Tool | URL |
|------|-----|
| TypeScript (handbook & tsconfig reference) | <https://www.typescriptlang.org/docs/> |
| TypeScript project references | <https://www.typescriptlang.org/docs/handbook/project-references.html> |
| Biome getting started | <https://biomejs.dev/guides/getting-started/> |
| Biome configuration reference | <https://biomejs.dev/reference/configuration/> |
| Biome upgrade to v2 | <https://biomejs.dev/guides/upgrade-to-biome-v2/> |
| Vitest guide | <https://vitest.dev/guide/> |
| Vitest configuration reference | <https://vitest.dev/config/> |
| Vitest coverage | <https://vitest.dev/guide/coverage> |
| Vitest projects | <https://vitest.dev/guide/projects.html> |
| Vite configuration | <https://vite.dev/config/> |
| Cloudflare Workers (wrangler, bindings, etc.) | Available via the **Cloudflare Docs MCP** tool |
| Terraform language & CLI | <https://developer.hashicorp.com/terraform/docs> |
| Cloudflare Terraform provider v5 | h<ttps://registry.terraform.io/providers/cloudflare/cloudflare/latest/docs> |
| jrhouston/dotenv Terraform provider | <https://registry.terraform.io/providers/jrhouston/dotenv/latest/docs> |
| npm workspaces | <https://docs.npmjs.com/cli/using-npm/workspaces> |
| React | <https://react.dev/reference/react> |

---

## Prohibited without pre-approval

The following require explicit human approval before being used. Asking for
approval interrupts the flow of work, so **exhaust the documentation and npm
script options first**.

- Writing and executing custom scripts: `node -e "..."`, inline Python, shell
  scripts, or any other ad-hoc program outside the npm scripts listed above.
- Installing new packages with `npm install` for a package you have not
  confirmed exists (check the docs or npm registry first).
- Running `git push`, `git rebase`, `git reset --hard`, or any destructive git
  operation.
- Directly reading or grepping inside `node_modules/` to inspect package
  internals. Use WebFetch to read official docs instead.

---

## Testing conventions

- **Tests live in `__tests__/` subdirectories.** Place every test file in a
  `__tests__/` directory next to the directory it covers, not alongside the
  source file itself.

  ```text
  src/
    middleware/
      auth.ts
      logger.ts
      __tests__/
        auth.test.ts
        logger.test.ts
    db/
      schema.ts
      __tests__/
        schema.test.ts
  ```

  The vitest `include` pattern `src/**/*.test.ts` picks up `__tests__/` files
  automatically — no config change is needed when adding a new test directory.

- **Test our code, not library code.** Only write tests that exercise logic
  written in this repository. Do not write tests that verify the behaviour of a
  third-party package — those packages have their own test suites.

  A concrete example of the anti-pattern to avoid: testing that an expired JWT
  causes a redirect exercises the `@adrianhall/cloudflare-auth` library
  internals, not anything we wrote. Correct tests for auth middleware verify
  *wiring*: that the public route is reachable, that the protected route
  requires auth, and that a valid token makes user context available to
  handlers.

  Ask "if I deleted this library and replaced it with a different one, would
  this test still be meaningful?" If the answer is no, the test is testing the
  library, not the integration.

- **Coverage gaps: triage before writing tests.** When coverage falls below the
  90% threshold, analyse the uncovered lines and sort them into three buckets
  before writing a single new test:

  | Bucket | Description | Action |
  |--------|-------------|--------|
  | **Simple** | Trivially uncovered: a branch that is one boolean flip away from being hit, or a helper function that just needs one more call-site test | **Write the test** |
  | **Standard flow** | Normal user-visible behaviour that is simply untested yet: the happy path for a feature, a mutation that fires after a timer, a navigation that happens after a success response | **Write the test** |
  | **Defensive programming** | Guards against impossible or library-internal states: `relatedTarget` checks for browser quirks, `clearTimeout` on a ref that is always `undefined` on first call, `null`-coalescing a value that TypeScript already guarantees is non-null, error branches that only fire if a third-party library misbehaves | **Skip — do not write a test** |

  Defensive programming misses are hard to trigger artificially, low value (they
  protect against conditions that never occur in practice), and often require
  complex test scaffolding (fake timers, DOM event injection, library internals)
  that makes tests brittle and expensive to maintain. Accept the small coverage
  gap rather than contorting tests to reach them.

  If the overall file coverage is still below 90% after covering all Simple and
  Standard Flow gaps, re-evaluate whether the remaining misses are truly
  defensive, or whether a meaningful integration scenario was overlooked.

---

## Repository conventions

- **Branch per issue:** work on `issues/NN`; never commit directly to `main`.
- **Conventional commits:** `<type>(issue-NN): <description>`.
- **Check before commit:** `npm run fix && npm run check && npm test` must all
  pass with zero errors.
- **Generated files are never committed:** `wrangler.jsonc`,
  `worker-configuration.d.ts`, `src/*/dist/`, `.wrangler/`. These are listed in
  `.gitignore`.
- **No `noEmit: true` in tsconfig compilerOptions:** use `tsc -b --noEmit` on
  the CLI instead; the static setting causes TS6310 with composite project
  references.
- **Biome v2 config keys:** `organizeImports` lives under
  `assist.actions.source.organizeImports`; file exclusions use `files.includes`
  with negation globs (`!pattern`), not `files.ignore`.
