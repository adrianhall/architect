# Bundle splitting: vendor chunks + route-level lazy loading

## Summary

After ISSUE-13 introduced `@xyflow/react`, the production build emits a single
603 kB JavaScript chunk (192 kB gzip) and prints a Vite warning:

```text
(!) Some chunks are larger than 500 kB after minification.
```

Every page load — including the dashboard and admin pages that never touch
React Flow — downloads and parses the entire canvas engine. This is wasteful
and will only worsen as ISSUE-14 through ISSUE-19 add more canvas code.

This issue applies two complementary techniques to eliminate the warning and
reduce per-route payload:

1. **Vendor chunk grouping** via `build.rollupOptions.output.manualChunks` in
   `vite.config.ts` — splits third-party libraries into named, individually
   cacheable chunks so the browser only re-downloads a vendor bundle when that
   specific library is updated.

2. **Route-level lazy loading** via `React.lazy` + `Suspense` in `App.tsx` —
   defers loading the Dashboard, Editor, and Admin page modules (and their
   transitive imports, including `@xyflow/react`) until the user navigates to
   that route for the first time.

The expected post-split output should have no chunk exceeding 200 kB
(minified), with `vendor-flow` (React Flow + Zustand) loading only on the
`/editor/:id` route.

**Depends on:** ISSUE-13 (introduced the bundle size problem)

## Relevant Skills

- `vercel-react-best-practices`
- `typescript-advanced-types`

## Requirements Coverage

No user-facing requirements are added. This issue improves F1-US1 (platform
foundations — performance and reliability) by ensuring initial page load does
not force users to download the entire canvas engine for every route.

## Acceptance Criteria

- [ ] `npm run build` produces **no chunk larger than 200 kB** (minified,
  before gzip). The Vite "> 500 kB" warning must not appear.
- [ ] The build output includes separate named chunks: `vendor-react`,
  `vendor-router`, `vendor-query`, `vendor-ui`, `vendor-flow`, and
  `vendor-zustand`.
- [ ] `@xyflow/react` code appears **only** in `vendor-flow` — it must not
  be present in the main app chunk or any page chunk.
- [ ] Dashboard, Editor, and Admin pages are lazy-loaded via `React.lazy`
  in `App.tsx`.
- [ ] A `<Suspense>` boundary wraps the lazy routes in `App.tsx` and shows a
  spinner fallback while the page chunk loads.
- [ ] `npm run check` passes (Biome + TypeScript + Terraform validate).
- [ ] `npm test` passes — all existing tests must continue to pass unchanged.
  The lazy wrappers in `App.tsx` must not affect page-level test files that
  import components directly.
- [ ] `npm run test:coverage` passes with > 90% coverage for modified files.
- [ ] `npm run build` builds all artifacts without errors or warnings.
- [ ] `npm start` builds and starts the service without errors.

## Technical Approach

### 1. Understand the current bundle composition

Run the build with verbose output to confirm the dependency topology before
making changes:

```bash
npm run build --workspace=src/frontend
```

The current output is a single `index-<hash>.js` (603 kB minified). The large
contributors are (approximate sizes pre-gzip):

| Library | Approx size | Used on |
|---------|-------------|---------|
| `react` + `react-dom` | ~140 kB | All routes |
| `@xyflow/react` + `@xyflow/system` | ~220 kB | Editor only |
| `@tanstack/react-query` | ~35 kB | All routes |
| `react-router-dom` | ~30 kB | All routes |
| `@radix-ui/*` + `lucide-react` | ~50 kB | Dashboard + Editor |
| `zustand` | ~5 kB | Editor only |
| App code | ~120 kB | Varies |

The highest-impact change is isolating `@xyflow/react` to a separate chunk
loaded only for the Editor route.

### 2. Add `manualChunks` to `vite.config.ts`

Open `src/frontend/vite.config.ts` and extend the `build` config with
`rollupOptions.output.manualChunks`. Use the **function form** (not the
object form) so that transitive dependencies (e.g. `@xyflow/system` pulled
in by `@xyflow/react`) are captured correctly:

```typescript
build: {
  outDir: "../worker/public",
  emptyOutDir: true,
  rollupOptions: {
    output: {
      /**
       * Explicit vendor chunk grouping.
       *
       * Function form is required so that transitive `node_modules` imports
       * are assigned to the correct chunk — Rollup passes the resolved module
       * id (absolute file path) for every module it processes.
       *
       * Priority matters: the first matching branch wins. Put the most
       * specific prefixes first.
       */
      manualChunks(id: string) {
        // React Flow engine — isolated so it only loads for the Editor route.
        if (id.includes("node_modules/@xyflow/")) {
          return "vendor-flow";
        }
        // Zustand state management — co-located with editor code.
        if (id.includes("node_modules/zustand/")) {
          return "vendor-zustand";
        }
        // Radix UI primitives and icon library — used by dashboard and editor.
        if (
          id.includes("node_modules/@radix-ui/") ||
          id.includes("node_modules/lucide-react/") ||
          id.includes("node_modules/class-variance-authority/") ||
          id.includes("node_modules/clsx/") ||
          id.includes("node_modules/tailwind-merge/")
        ) {
          return "vendor-ui";
        }
        // TanStack Query — server state layer used everywhere.
        if (id.includes("node_modules/@tanstack/")) {
          return "vendor-query";
        }
        // React Router.
        if (
          id.includes("node_modules/react-router-dom/") ||
          id.includes("node_modules/react-router/") ||
          id.includes("node_modules/@remix-run/")
        ) {
          return "vendor-router";
        }
        // React runtime — split last to avoid absorbing react-router or react-query.
        if (
          id.includes("node_modules/react-dom/") ||
          id.includes("node_modules/react/") ||
          id.includes("node_modules/scheduler/")
        ) {
          return "vendor-react";
        }
        // All other node_modules go into a generic vendor chunk.
        if (id.includes("node_modules/")) {
          return "vendor-misc";
        }
        // App source files — Rollup's default chunking applies.
        return undefined;
      },
    },
  },
},
```

**Why `vendor-flow` remains large but that's OK:** even as a separate chunk,
`@xyflow/react` is ~220 kB minified — well under 500 kB — and it is only
fetched when the user navigates to `/editor/:id` for the first time. A
returning user gets it from the browser cache.

### 3. Add route-level lazy loading in `App.tsx`

Replace the three static page imports with `React.lazy` dynamic imports and
wrap the route tree with a `<Suspense>` boundary. The boundary sits inside
`ProtectedRoute` + `AppShell` so the spinner appears within the app chrome:

```typescript
import { lazy, Suspense } from "react";

// Lazy-loaded page modules.
// Each produces a separate code-split chunk at build time.
const Dashboard = lazy(() =>
  import("@/pages/Dashboard").then((m) => ({ default: m.Dashboard }))
);
const Editor = lazy(() =>
  import("@/pages/Editor").then((m) => ({ default: m.Editor }))
);
const Admin = lazy(() =>
  import("@/pages/Admin").then((m) => ({ default: m.Admin }))
);
```

Note the `.then((m) => ({ default: m.Dashboard }))` pattern: `React.lazy`
requires a module with a **default export**, but our pages use named exports
(`export function Dashboard()`). The `.then` wrapper adapts the named export
to the default-export shape that `React.lazy` expects.

Add a `RouteFallback` component for the Suspense boundary. Reuse the same
CSS spinner pattern as `ProtectedRoute` so the loading state is visually
consistent:

```tsx
/**
 * Fallback shown by the Suspense boundary while a lazy page chunk loads.
 * Uses the same spinner style as ProtectedRoute's auth-loading state.
 */
function RouteFallback() {
  return (
    <div className="flex h-full items-center justify-center" role="status">
      <span className="sr-only">Loading…</span>
      <div className="size-8 animate-spin rounded-full border-4 border-current border-t-transparent" />
    </div>
  );
}
```

Then update the route tree inside `App`:

```tsx
<Routes>
  <Route
    element={
      <ProtectedRoute>
        <AppShell />
      </ProtectedRoute>
    }
  >
    {/* Suspense boundary: shown while a lazy page chunk fetches */}
    <Route
      element={
        <Suspense fallback={<RouteFallback />}>
          <Outlet />
        </Suspense>
      }
    >
      <Route path="/" element={<Dashboard />} />
      <Route path="/editor/:id" element={<Editor />} />
      <Route
        path="/admin"
        element={
          <AdminRoute>
            <Admin />
          </AdminRoute>
        }
      />
    </Route>
  </Route>
</Routes>
```

> **Note on React Router + Suspense:** React Router v7 renders the `element`
> of a layout `<Route>` on every navigation. Nesting a `<Suspense>` layout
> route between `ProtectedRoute/AppShell` and the page routes ensures the
> fallback is scoped inside the chrome — the user sees the spinner in the
> content area, not a blank full-screen state.

Remove the three static page imports that are replaced by `lazy(...)`. The
`AdminRoute`, `AppShell`, `ProtectedRoute`, and `AuthProvider` imports remain
static because they are part of the app shell that loads immediately.

Also import `Outlet` from `react-router-dom` (needed for the Suspense layout
route).

### 4. Keep the React Flow CSS import static

The `@xyflow/react/dist/style.css` import in `main.tsx` is a static CSS
import. Vite extracts all CSS (regardless of the JS chunk that imports it) into
a single CSS bundle. Leave this import as-is — moving it to a lazy import
would require more complex dynamic CSS loading and the 42 kB CSS file is
already loaded in parallel with JS, not blocking.

### 5. Verify the output

After the changes, run:

```bash
npm run build --workspace=src/frontend
```

The output should look similar to:

```text
../worker/public/assets/vendor-react-<hash>.js    ~140 kB
../worker/public/assets/vendor-router-<hash>.js    ~30 kB
../worker/public/assets/vendor-query-<hash>.js     ~35 kB
../worker/public/assets/vendor-ui-<hash>.js        ~55 kB
../worker/public/assets/vendor-flow-<hash>.js     ~220 kB  ← only fetched for /editor/:id
../worker/public/assets/vendor-zustand-<hash>.js    ~5 kB
../worker/public/assets/index-<hash>.js            ~30 kB  ← app shell + routing
../worker/public/assets/Dashboard-<hash>.js        ~20 kB
../worker/public/assets/Editor-<hash>.js           ~30 kB
../worker/public/assets/Admin-<hash>.js             ~5 kB
../worker/public/assets/index-<hash>.css           ~42 kB
```

No chunk should exceed 200 kB. The "> 500 kB" Vite warning must be gone.

To confirm `@xyflow/react` is not in the main bundle:

```bash
# grep for the xyflow package name inside each JS chunk
# (exact approach depends on whether minification renames identifiers)
ls ../worker/public/assets/vendor-flow-*.js   # should exist
ls ../worker/public/assets/index-*.js          # main app shell
```

Rollup will also log which modules landed in which chunk if you add
`build.rollupOptions.output.chunkFileNames = "[name]-[hash].js"` (not strictly
needed but makes the output more readable during verification).

### 6. Fix the `App.tsx` JSDoc

The existing JSDoc on `App` explains the static page imports. Update it to
reflect lazy loading:

```ts
/**
 * …
 *
 * All three page components are **lazy-loaded** via `React.lazy` so that
 * the canvas engine (`@xyflow/react`) is not downloaded until the user
 * navigates to `/editor/:id`. A `<Suspense>` layout route provides a
 * spinner fallback while the page chunk fetches.
 *
 * …
 */
```

### 7. Update `App.test.tsx`

The existing test renders `<App />` and waits for the Dashboard heading.
`React.lazy` makes page loading asynchronous, so Vitest needs to flush the
dynamic import promise before the component renders. In the jsdom environment,
Vitest resolves dynamic imports synchronously within the same microtask queue,
so the existing `waitFor` polling should catch the resolved component with no
changes required.

**Run the test to confirm.** If it fails with a timeout, wrap the render in
`act`:

```tsx
import { act } from "react";

it("renders the dashboard when authenticated", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ data: mockUser }), { status: 200 })
  );

  await act(async () => {
    render(<App />);
  });

  await waitFor(() => {
    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
  });
});
```

Page-level tests (`Editor.test.tsx`, `Dashboard.test.tsx`, `Admin.test.tsx`)
import page components directly and are **not affected** by the lazy wrapper —
they will continue to pass unchanged.

### 8. File inventory

| File | Change |
|------|--------|
| `src/frontend/vite.config.ts` | Add `rollupOptions.output.manualChunks` |
| `src/frontend/src/App.tsx` | Convert page imports to `React.lazy`, add `Suspense` layout route, add `RouteFallback` |
| `src/frontend/src/App.test.tsx` | Verify still passes; add `act` wrap if needed |

## Testing

No new test files are required. This issue changes the build configuration and
async routing wiring — concerns that are verified by the existing test suite
plus a visual inspection of the build output.

### Regression checklist (all must pass)

| Command | Expected outcome |
|---------|-----------------|
| `npm run build` | No chunk > 200 kB; no "> 500 kB" Vite warning |
| `npm run check` | Zero Biome, TypeScript, and Terraform errors |
| `npm test` | All tests pass (301 tests across all projects) |
| `npm run test:coverage` | Coverage ≥ 90% for `App.tsx` and `vite.config.ts` |

### Manual smoke tests

After `npm start`:

1. Open DevTools → Network tab, filter to JS. Navigate to `/` — confirm the
   `vendor-flow` chunk is **not** downloaded.
2. Navigate to `/editor/<any-id>` — confirm `vendor-flow` **is** downloaded at
   that point.
3. Navigate back to `/` — confirm `vendor-flow` is served from cache (304 or
   disk cache), not re-downloaded.
4. Reload on the editor page — confirm `vendor-flow` loads first (from cache
   after the first visit).
5. Confirm the spinner fallback appears briefly on initial navigation to each
   lazy route (most visible on a throttled network in DevTools).
