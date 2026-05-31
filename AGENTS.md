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
| Zustand | <https://github.com/pmndrs/zustand/tree/main/docs> - use markdown files from GitHub instead of the docs site |

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
- **Named exports over default exports** for all components and hooks. Named
  exports allow sibling symbols to be added later without changing import
  statements at call sites, and are consistent across the codebase.

---

## Frontend coding conventions

### Defensive nullish coalescing — use `getValueOrDefault`

When a `??` default branch will never be reached in practice (defensive guard
against impossible or library-internal states), use `getValueOrDefault` from
`@architect/shared` instead of the bare `??` operator:

```typescript
import { getValueOrDefault } from "@architect/shared";

// ✅ Defensive — map lookup guaranteed by preceding .has() filter
const services = getValueOrDefault(servicesByCategory.get(cat.id), []);

// ✅ Defensive — route param guaranteed by router
const id = getValueOrDefault(routeParam, "");

// ✅ Defensive — ELK always populates x/y after a successful layout
const x = getValueOrDefault(child.x, 0);
```

Leave bare `??` for defaults that **are** genuinely reachable at runtime:

```typescript
// ✅ Reachable — user may have no display name
const display = user.name ?? user.email;

// ✅ Reachable — category may be absent during a stale catalog drop
const color = category?.color ?? "#6b7280";
```

This keeps v8 branch coverage clean: both branches of `getValueOrDefault` are
covered by its own unit tests, so call sites don't accumulate uncovered
defensive branches.

### Read Zustand store state inside callbacks with `getState()`

Inside `useCallback`, read current store state via `useDiagramStore.getState()`
rather than closing over reactive values:

```typescript
// ✅ Always current — no stale closure, no extra dependency array entries
const handleDrop = useCallback((event: DragEvent) => {
    const { nodes } = useDiagramStore.getState();
    // ...
}, [catalog, screenToFlowPosition, addNode]);

// ❌ Stale closure — forces nodes into the dependency array, recreating
//    the callback on every node position change (very frequent during drag)
const handleDrop = useCallback((event: DragEvent) => {
    const nodeCount = nodes.length; // stale if nodes changes
}, [catalog, nodes, screenToFlowPosition, addNode]);
```

### `useRef` not `useState` for values shared between event handlers

When two paired event handlers (e.g. `onDragStart`/`onDragStop`) must share a
mutable intermediate value, use a `ref`, not state:

```typescript
// ✅ Ref — always current; both handlers use a stable useCallback([]) reference
const dragPositionsRef = useRef<Map<string, Position>>(new Map());
const onDragStart = useCallback((_e, node) => {
    dragPositionsRef.current.set(node.id, node.position);
}, []);
const onDragStop = useCallback((_e, node) => {
    const from = dragPositionsRef.current.get(node.id); // always current
}, []);

// ❌ State — onDragStop captures a pre-update snapshot; the re-render that
//    would apply setDragPositions hasn't fired yet when onDragStop runs
```

### Radix UI — `onSelect` not `onClick` on `DropdownMenuItem`

Radix closes its dropdown portal on `pointerup`, before the native `click`
event fires. State updates placed in `onClick` may be silently discarded
because the component has already unmounted. Always put state-change logic in
`onSelect`:

```tsx
// ✅
<DropdownMenuItem onSelect={() => setIsRenaming(true)}>Rename</DropdownMenuItem>

// ❌ — onClick may be dropped after portal unmount
<DropdownMenuItem onClick={() => setIsRenaming(true)}>Rename</DropdownMenuItem>
```

When a `DropdownMenuItem` is inside a larger clickable container (e.g. a card
that navigates), also add `onClick={(e) => e.stopPropagation()}` on each item
to prevent the container's `onClick` from firing alongside `onSelect`.

### Tailwind v4 — do not define `--spacing-{name}` tokens

In Tailwind v4, `max-w-{name}` resolves to `var(--container-{name})` with a
fallback to `var(--spacing-{name})`. Defining custom `--spacing-sm/md/lg`
tokens therefore silently overrides the default container scale:

```css
/* ❌ Breaks max-w-lg (resolves to 1.5rem instead of 32rem) */
@theme {
  --spacing-sm: 0.5rem;
  --spacing-lg: 1.5rem;
}
```

Use only the numeric spacing scale (`p-4`, `gap-6`, etc.) and the default
`--container-*` tokens for `max-w-*` utilities.

### shadcn CLI — manually add peer dependencies after installation

The shadcn CLI installs Radix packages into `node_modules` but does **not**
update `src/frontend/package.json`. After running `npx shadcn@latest add
<component>`, manually inspect the installed component file and add any
missing peer dependencies (commonly `class-variance-authority`,
`lucide-react`, Radix primitives) as explicit entries in
`src/frontend/package.json`. npm workspace hoisting is not guaranteed, so
missing entries cause TypeScript errors on clean installs.

### Accessible interactive elements

Biome enforces semantic HTML. Interactive elements (anything with `onClick`,
`onDragStart`, keyboard handlers, etc.) must be a semantic element or have a
matching ARIA role:

```tsx
// ✅ Native interactive element — no ARIA needed
<button type="button" draggable onDragStart={...}>...</button>
<section aria-label="Services">...</section>

// ❌ Biome noStaticElementInteractions / useSemanticElements
<div onDragStart={...}>...</div>
<div role="region">...</div>
```

---

## Testing conventions (additions)

### Do not spy on Zustand store methods with `vi.spyOn`

Zustand's `setState` creates a new state object via `Object.assign({},
prevState, patch)`. A `vi.spyOn` wrapper placed on the old state object is
copied into the new state, and `vi.restoreAllMocks()` only restores the
original on the old object — leaving the spy active on the new state and
accumulating call counts across tests.

**Instead:** assert on observable side effects — the resulting values in the
store (`useDiagramStore.getState().nodes`, `.undoStack`, etc.) rather than
whether a specific action method was called.

**For store setup in tests:** prefer `loadDiagram(...)` over `setState({...})`
as it fully reinitialises all store fields atomically, preventing spy
bleed-through from partial merges.

### Async timer callbacks require `vi.advanceTimersByTimeAsync`

When a `setTimeout` or `setInterval` callback is `async`, plain
`vi.advanceTimersByTime(ms)` fires the timer but does not await its Promise —
leaving the callback's async work pending. Use the async variant:

```typescript
// ✅ Correctly awaits the async callback
await act(async () => {
    await vi.advanceTimersByTimeAsync(500);
});

// ❌ Fires the timer but async body is still pending; post-save assertions fail
act(() => { vi.advanceTimersByTime(500); });
```

### Use `vi.clearAllTimers()` — not `vi.runAllTimers()` — for `setInterval` teardown

`vi.runAllTimers()` runs all pending timers including `setInterval`, which
re-schedules itself, looping until Vitest hits its 10 000-timer safety limit.
Use `vi.clearAllTimers()` in `afterEach` to discard timers without running
them:

```typescript
afterEach(() => {
    vi.clearAllTimers(); // ✅ discards without running
    vi.useRealTimers();
});
```

### Radix DropdownMenu testing — open with `userEvent`, select with `fireEvent`

Opening a Radix dropdown requires the full pointer-event sequence:

```typescript
// ✅ Open the menu (needs full pointer sequence)
await userEvent.click(screen.getByRole("button", { name: /actions/i }));

// ✅ Select a menu item (fireEvent.click triggers onSelect correctly in jsdom)
fireEvent.click(screen.getByText("Rename"));

// ❌ userEvent.click on a DropdownMenuItem is unreliable in jsdom —
//    Radix's isPointerDownRef logic may prevent onSelect from firing
await userEvent.click(screen.getByText("Rename"));
```

### Drizzle ORM — always use camelCase property names

The Drizzle schema defines **camelCase** TypeScript property names
(`avatarUrl`, `createdAt`, `graphData`) that map to snake_case SQL column
names. The API wire format is snake_case but Drizzle's `.values()`,
`.insert()`, and query result objects all use camelCase.

```typescript
// ✅ Drizzle insert — camelCase matches the schema definition
await db.insert(users).values({ avatarUrl: "...", createdAt: Date.now() });

// ❌ Will cause a TypeScript error and incorrect column mapping
await db.insert(users).values({ avatar_url: "...", created_at: Date.now() });
```

Local API response types (e.g. `ApiUser`) use snake_case to match the wire
format because the route handlers explicitly convert camelCase Drizzle results
back to snake_case JSON. Keep this boundary clear: camelCase inside the worker
(Drizzle), snake_case in JSON responses.
