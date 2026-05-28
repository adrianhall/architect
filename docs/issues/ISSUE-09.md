# Frontend scaffolding: Vite, React, Tailwind, shadcn

## Summary

Set up the complete frontend workspace with Vite build tooling, React 18, Tailwind CSS v4, and shadcn/ui component primitives. After this issue the frontend builds to `src/worker/public/`, the Vite dev server proxies API calls to wrangler dev, shadcn is initialized and ready for component installation, and a smoke test verifies the React app renders.

## Relevant Skills

- `shadcn`
- `tailwind-design-system`
- `vercel-react-best-practices`

## Requirements Coverage

- [F1](../REQUIREMENTS.md) (platform foundations — frontend portion): The frontend build pipeline, dev server proxy, and design system foundation are established. The Vite build outputs to the Worker's public directory so the Worker can serve the SPA via `c.env.ASSETS.fetch()`.

## Dependencies

- **ISSUE-01** — Workspace structure, `src/frontend` package stub, vitest config with jsdom environment, and root-level scripts must exist.

## Acceptance Criteria

- [ ] `src/frontend/vite.config.ts` exists with build output to `../worker/public/` and proxy for `/api` and `/_auth` to `http://localhost:8787`.
- [ ] `src/frontend/index.html` is a minimal HTML shell with `<div id="root"></div>` and a script tag pointing to `src/main.tsx`.
- [ ] `src/frontend/src/main.tsx` uses `React 18 createRoot` to mount the App component into `#root`.
- [ ] `src/frontend/src/App.tsx` renders a "CF-Architect" heading.
- [ ] Tailwind CSS v4 is installed and configured with `@import "tailwindcss"` and a `@theme` block with design tokens in `src/frontend/src/app.css`.
- [ ] `app.css` is imported in `main.tsx`.
- [ ] shadcn/ui is initialized in `src/frontend` with Tailwind v4, TypeScript, and `@/` path alias.
- [ ] `src/frontend/src/lib/utils.ts` exports a `cn()` utility (clsx + tailwind-merge).
- [ ] React 18 (`react`, `react-dom`) and `react-router-dom` are installed as dependencies.
- [ ] `@types/react` and `@types/react-dom` are installed as devDependencies.
- [ ] `src/frontend/package.json` has a `dev` script that starts Vite dev server and a `build` script that runs Vite build.
- [ ] `src/frontend/vitest.config.ts` (from ISSUE-01) works with jsdom and can run component tests.
- [ ] A smoke test renders the App component and asserts the heading text is present.
- [ ] `npm run build` builds all artifacts.
- [ ] `npm run check` passes.
- [ ] `npm run test` passes.
- [ ] `npm run test:coverage` passes with > 90% coverage for new and changed files.
- [ ] `npm start` builds and starts the service without errors.

## Technical Approach

### Step 1: Install frontend dependencies

Install React 18 (not React 19), Vite, and the Tailwind/shadcn toolchain in the frontend workspace:

```bash
# Core React (pin to React 18)
npm install react@18 react-dom@18 react-router-dom --workspace=src/frontend

# Dev dependencies
npm install --save-dev @types/react@18 @types/react-dom@18 --workspace=src/frontend
npm install --save-dev vite @vitejs/plugin-react --workspace=src/frontend

# Tailwind CSS v4
npm install --save-dev tailwindcss @tailwindcss/vite --workspace=src/frontend

# shadcn utilities (clsx + tailwind-merge for cn())
npm install clsx tailwind-merge --workspace=src/frontend

# Testing
npm install --save-dev @testing-library/react @testing-library/jest-dom --workspace=src/frontend
```

> **Important:** Pin React to version 18 explicitly. React 19 has breaking changes with React Flow and other libraries used later. Use `react@18` and `react-dom@18`, not `react@latest`.

### Step 2: Create `src/frontend/vite.config.ts`

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  build: {
    outDir: "../worker/public",
    emptyOutDir: true,
  },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: true,
      },
      "/_auth": {
        target: "http://localhost:8787",
        changeOrigin: true,
      },
    },
  },
});
```

**Key decisions:**

- `outDir: "../worker/public"` — The built SPA is output to the Worker's public directory. The Worker's `ASSETS` binding serves these files via `c.env.ASSETS.fetch(c.req.raw)`.
- `emptyOutDir: true` — Cleans the output directory before each build to avoid stale files.
- `resolve.alias` — The `@/` alias maps to `src/`, matching shadcn conventions and enabling clean imports like `@/components/ui/button`.
- Proxy config — During `npm run start:frontend` (Vite dev mode), requests to `/api/*` and `/_auth/*` are forwarded to the wrangler dev server on port 8787. This is for hot-reload convenience only. In production and in `npm start`, the built frontend is served directly by the Worker.

### Step 3: Create `src/frontend/index.html`

Create the HTML shell at `src/frontend/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>CF-Architect</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

**Notes:**

- The `<div id="root"></div>` is the React mount point.
- The `<script>` tag points to `src/main.tsx` — Vite resolves this during dev and bundles it during build.
- No CSS link tag is needed — Tailwind CSS is imported via JavaScript in `main.tsx`.

### Step 4: Create `src/frontend/src/app.css`

Create the Tailwind CSS entry point with design tokens:

```css
@import "tailwindcss";

@theme {
  /* Colors — CF brand palette */
  --color-primary: #f6821f;
  --color-primary-foreground: #ffffff;
  --color-secondary: #404242;
  --color-secondary-foreground: #ffffff;
  --color-accent: #0051c3;
  --color-accent-foreground: #ffffff;
  --color-destructive: #d63638;
  --color-destructive-foreground: #ffffff;
  --color-muted: #f1f1f1;
  --color-muted-foreground: #6b7280;
  --color-background: #ffffff;
  --color-foreground: #1a1a1a;
  --color-card: #ffffff;
  --color-card-foreground: #1a1a1a;
  --color-border: #e5e7eb;
  --color-input: #e5e7eb;
  --color-ring: #f6821f;
  --color-popover: #ffffff;
  --color-popover-foreground: #1a1a1a;

  /* Category accent colors (from REQUIREMENTS.md design notes) */
  --color-category-developer: #2563eb;
  --color-category-zero-trust: #16a34a;
  --color-category-cdn: #ea580c;
  --color-category-other: #ea580c;
  --color-category-external: #6b7280;

  /* Spacing scale */
  --spacing-xs: 0.25rem;
  --spacing-sm: 0.5rem;
  --spacing-md: 1rem;
  --spacing-lg: 1.5rem;
  --spacing-xl: 2rem;
  --spacing-2xl: 3rem;

  /* Border radius */
  --radius-sm: 0.25rem;
  --radius-md: 0.375rem;
  --radius-lg: 0.5rem;
  --radius-xl: 0.75rem;
  --radius-2xl: 1rem;

  /* Font families */
  --font-sans: "Inter", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, monospace;

  /* Font sizes */
  --text-xs: 0.75rem;
  --text-sm: 0.875rem;
  --text-base: 1rem;
  --text-lg: 1.125rem;
  --text-xl: 1.25rem;
  --text-2xl: 1.5rem;
  --text-3xl: 1.875rem;
}
```

**Notes:**

- The `@import "tailwindcss"` directive is the Tailwind CSS v4 entry point — no `@tailwind base/components/utilities` directives needed.
- The `@theme` block defines design tokens as CSS custom properties that Tailwind CSS v4 consumes. These are available as utility classes (e.g., `bg-primary`, `text-muted-foreground`, `rounded-lg`).
- Category colors match the REQUIREMENTS.md design notes: Developer Platform (blue), Zero-Trust (green), CDN/Application (orange), Other (orange), Non-Cloudflare (gray).
- The primary color is Cloudflare orange (`#f6821f`).

### Step 5: Create `src/frontend/src/main.tsx`

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./app.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element not found");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

**Notes:**

- Uses React 18's `createRoot` API (not the legacy `ReactDOM.render`).
- Wrapped in `StrictMode` for development warnings.
- Imports `app.css` to activate Tailwind CSS.
- Throws an explicit error if the root element is missing rather than silently failing.

### Step 6: Create `src/frontend/src/App.tsx`

```tsx
export function App() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
      <h1 className="text-3xl font-bold text-primary">CF-Architect</h1>
    </div>
  );
}
```

This is a minimal placeholder that demonstrates Tailwind CSS is working (uses design tokens from the `@theme` block). It will be replaced in ISSUE-10 with the router and app shell.

### Step 7: Create `src/frontend/src/lib/utils.ts`

The `cn()` utility is the standard shadcn pattern for merging Tailwind classes:

```ts
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

This is used by all shadcn components and should be used throughout the app for conditional class merging.

### Step 8: Initialize shadcn/ui

Run the shadcn init command in the frontend workspace:

```bash
cd src/frontend
npx shadcn@latest init
```

When prompted, select:

- Style: Default
- Base color: Neutral
- CSS file: `src/app.css`
- CSS variables: yes
- Tailwind version: v4
- Path alias for components: `@/components`
- Path alias for utils: `@/lib/utils`

This creates a `components.json` file in `src/frontend/` that configures shadcn for the project. If the interactive prompts are problematic in an automated context, create the `components.json` file manually:

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/app.css",
    "baseColor": "neutral",
    "cssVariables": true
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}
```

**Key settings:**

- `rsc: false` — This is a client-side SPA, not a React Server Components project.
- `tsx: true` — Use TypeScript.
- `tailwind.css` points to our `src/app.css`.
- All aliases use the `@/` prefix which maps to `src/` via the Vite resolve alias.

### Step 9: Update `src/frontend/package.json`

Update the package.json to add `dev` and `build` scripts and ensure all dependencies are listed:

```json
{
  "name": "@architect/frontend",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "vitest run"
  },
  "dependencies": {
    "@architect/shared": "*",
    "clsx": "^2.1.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "react-router-dom": "^7.0.0",
    "tailwind-merge": "^3.0.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.0.0",
    "@testing-library/react": "^16.0.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.0.0",
    "vite": "^6.0.0",
    "tailwindcss": "^4.0.0",
    "@tailwindcss/vite": "^4.0.0",
    "jsdom": "^26.0.0"
  }
}
```

> **Note:** The exact version ranges will be determined by npm at install time. The key constraint is React 18 — do not install React 19.

### Step 10: Update `src/frontend/tsconfig.json`

Update the TypeScript config to include the `@/` path alias and JSX settings:

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
    "rootDir": "src",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"],
  "references": [
    { "path": "../shared" }
  ]
}
```

The `paths` field maps `@/*` to `./src/*` so TypeScript resolves the same alias that Vite handles at build time.

### Step 11: Update `src/frontend/vitest.config.ts`

Update the vitest config to include the `@/` path alias so tests can resolve imports:

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    name: "frontend",
    environment: "jsdom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    setupFiles: ["./src/test/setup.ts"],
  },
});
```

### Step 12: Create test setup file

Create `src/frontend/src/test/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

This registers the jest-dom matchers (like `toBeInTheDocument()`, `toHaveTextContent()`) with Vitest globally.

### Step 13: Write the smoke test

Create `src/frontend/src/App.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { App } from "./App";

describe("App", () => {
  it("renders the CF-Architect heading", () => {
    render(<App />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "CF-Architect",
    );
  });
});
```

### Step 14: Clean up placeholder files from ISSUE-01

ISSUE-01 created placeholder files at `src/frontend/src/main.tsx` and `src/frontend/src/main.test.tsx`. These need to be replaced:

- **Replace** `src/frontend/src/main.tsx` with the real entry point (Step 5).
- **Remove** or replace `src/frontend/src/main.test.tsx` — the placeholder test tested the old stub export. The new smoke test in `App.test.tsx` replaces it.

If `main.test.tsx` still imports the old `App` from `main.tsx`, either update it to import from `App.tsx` or remove it entirely (the `App.test.tsx` provides the equivalent coverage).

### Step 15: Verify everything works

Run the full verification:

```bash
npm install                  # Install new dependencies
npm run build                # Should build frontend to src/worker/public/
npm run check                # TypeScript + Biome checks pass
npm test                     # All tests pass (worker + frontend)
npm run test:coverage        # > 90% coverage on new files
npm start                    # Builds frontend, starts wrangler dev
```

Also verify the Vite dev server works independently:

```bash
npm run start:frontend       # Starts Vite dev server with HMR
```

### File inventory

| File | Purpose |
|------|---------|
| `src/frontend/vite.config.ts` | Vite build config with output dir, proxy, and aliases |
| `src/frontend/index.html` | HTML shell with root div |
| `src/frontend/src/main.tsx` | React 18 createRoot entry point |
| `src/frontend/src/App.tsx` | Placeholder app component with heading |
| `src/frontend/src/app.css` | Tailwind CSS v4 entry with design tokens |
| `src/frontend/src/lib/utils.ts` | `cn()` utility for Tailwind class merging |
| `src/frontend/components.json` | shadcn/ui configuration |
| `src/frontend/src/test/setup.ts` | Vitest setup for jest-dom matchers |
| `src/frontend/src/App.test.tsx` | Smoke test for App component |

## Testing

### Unit Tests

| File | What it tests |
|------|---------------|
| `src/frontend/src/App.test.tsx` | Renders the App component and verifies the "CF-Architect" heading is present using `@testing-library/react` |

### Manual Tests

After `npm start` completes:

1. **Frontend served by Worker:** Open `http://localhost:8787` in a browser. After logging in via the PIN form, you should see the "CF-Architect" heading styled with Tailwind (orange text on white background).

2. **Vite dev server (separate terminal):** Run `npm run start:frontend`. Open `http://localhost:5173`. You should see the same "CF-Architect" heading with hot module replacement active. Editing `App.tsx` should instantly reflect changes.

3. **API proxy works:** With both `npm start` (port 8787) and `npm run start:frontend` (port 5173) running, open `http://localhost:5173/api/version` — it should proxy to wrangler dev and return `{ "data": { "version": "1.0.0" } }`.

4. **Tailwind classes applied:** Inspect the heading element — it should have the Cloudflare orange color (`#f6821f`) applied via the `text-primary` class from the design tokens.

5. **Build output:** Run `npm run build:frontend` and verify that `src/worker/public/` contains `index.html` and bundled JS/CSS assets.
