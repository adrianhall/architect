import { copyFileSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { defineConfig } from "vite";

/**
 * Custom Vite plugin that makes the Cloudflare service catalog SVG icons
 * available at `/catalog/icons/<iconPath>` in both dev and production.
 *
 * **Production (`vite build`):**
 * The `closeBundle` hook runs after the output directory has been emptied and
 * all chunks have been written. It copies every SVG from `catalog/icons/`
 * (repo root) into `<outDir>/catalog/icons/` so the Workers ASSETS binding
 * (`c.env.ASSETS.fetch()`) can serve them. Without this step the icons are
 * never included in the build output because Vite only bundles files that are
 * statically imported — the SVGs are referenced at runtime via
 * `src="/catalog/icons/<iconPath>"` strings returned by the API.
 *
 * **Dev mode (`vite dev` / `npm run start:frontend`):**
 * The `closeBundle` hook does NOT fire during `vite dev` — no bundle is
 * written. The `configureServer` hook adds a Connect middleware that intercepts
 * `/catalog/icons/*` requests and streams the matching file directly from
 * `catalog/icons/` in the repo root. This means icons work without a wrangler
 * dev server and without any additional build step.
 *
 * **Why a plugin rather than an npm script or a `public/` symlink:**
 * Tying both behaviours to the plugin keeps the icon-serving logic in one
 * place. The `closeBundle` hook runs after `emptyOutDir: true` has cleared the
 * output tree, guaranteeing icons are always present in the freshly built
 * `public/` directory. A separate npm script could run before the clean and
 * lose the icons.
 *
 * @returns A Vite plugin that serves catalog icons in dev mode and copies them
 *   on production build.
 */
function copyCatalogIcons(): Plugin {
	const iconsDir = path.resolve(__dirname, "../../catalog/icons");
	const outIconsDir = path.resolve(__dirname, "../worker/public/catalog/icons");

	return {
		name: "copy-catalog-icons",

		/**
		 * Dev-mode middleware: intercepts GET `/catalog/icons/<fileName>` and
		 * serves the matching SVG file directly from `catalog/icons/` in the
		 * repo root. Path traversal is rejected by verifying the resolved path
		 * stays within `iconsDir`.
		 *
		 * @param server - The Vite dev server instance.
		 */
		configureServer(server) {
			const prefix = "/catalog/icons/";
			server.middlewares.use((req, res, next) => {
				const url = req.url?.split("?")[0] ?? "";
				if (!url.startsWith(prefix)) {
					next();
					return;
				}
				const fileName = decodeURIComponent(url.slice(prefix.length));
				if (!fileName) {
					next();
					return;
				}
				const resolved = path.resolve(iconsDir, fileName);
				// Reject any path that escapes the icons directory.
				const rel = path.relative(iconsDir, resolved);
				if (rel.startsWith("..") || path.isAbsolute(rel)) {
					next();
					return;
				}
				try {
					const content = readFileSync(resolved);
					res.setHeader("Content-Type", "image/svg+xml");
					res.end(content);
				} catch {
					next();
				}
			});
		},

		/**
		 * Production-build hook: runs after the bundle is written to disk.
		 * Creates the destination directory if absent, then copies every file
		 * from `catalog/icons/` verbatim into the build output.
		 */
		closeBundle() {
			mkdirSync(outIconsDir, { recursive: true });
			for (const file of readdirSync(iconsDir)) {
				copyFileSync(path.join(iconsDir, file), path.join(outIconsDir, file));
			}
		},
	};
}

/**
 * Vite configuration for the CF-Architect frontend.
 *
 * - Output is sent to `../worker/public/` so the Cloudflare Worker can serve
 *   the built SPA via `c.env.ASSETS.fetch()` without any additional tooling.
 * - `copyCatalogIcons()` plugin copies `catalog/icons/*.svg` into the output
 *   after each build so the ASSETS binding can serve them at
 *   `/catalog/icons/<iconPath>`.
 * - The `@/` alias mirrors the TypeScript path alias in `tsconfig.json`,
 *   matching shadcn's convention of `@/components/ui/button` imports.
 * - During Vite dev mode (`npm run start:frontend`), `/api/*` and `/_auth/*`
 *   requests are proxied to the wrangler dev server on port 8787. In
 *   production, the Worker handles both assets and API directly.
 * - `codeSplitting.groups` splits third-party libraries into named,
 *   individually cacheable chunks. Most importantly, `vendor-flow`
 *   (`@xyflow/react`) is isolated so it is **only** fetched when the user
 *   navigates to `/editor/:id` — all other routes skip the ~220 kB canvas
 *   engine.
 *
 * **Vite 8 / Rolldown migration notes:**
 * - `build.rolldownOptions` replaces the deprecated `build.rollupOptions`.
 * - `output.codeSplitting.groups` replaces the deprecated function form of
 *   `output.manualChunks`. Groups are evaluated in order; the first matching
 *   group captures a module and (by default) its transitive dependencies that
 *   have not been claimed by an earlier group. Base libraries (`vendor-react`)
 *   are therefore listed before the libraries that depend on them so that
 *   shared dependencies are not duplicated across chunks.
 */
export default defineConfig({
	plugins: [react(), tailwindcss(), copyCatalogIcons()],
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "src"),
		},
	},
	build: {
		outDir: "../worker/public",
		emptyOutDir: true,
		/**
		 * Raise the chunk-size warning threshold to accommodate the `elkjs`
		 * auto-layout library (~1.5 MB minified). `elkjs` is inherently large
		 * because it is a Java-to-JavaScript transpilation of the Eclipse Layout
		 * Kernel and cannot meaningfully be reduced by tree-shaking.
		 *
		 * This setting does NOT affect end-user performance: `vendor-elk` is only
		 * fetched when the user navigates to `/editor/:id` (lazy-routed), and is
		 * served from the browser cache on subsequent visits. All other routes
		 * (dashboard, admin, landing) never download this chunk.
		 *
		 * The default threshold (500 kB) is kept for all other chunks by this
		 * configuration — the higher limit is only necessary because elkjs exceeds
		 * it. If a future refactor removes or replaces elkjs with a lighter library,
		 * this value should be reduced back to 500.
		 */
		chunkSizeWarningLimit: 1600,
		/**
		 * Rolldown build options (replaces the deprecated `rollupOptions`).
		 *
		 * `output.codeSplitting.groups` assigns third-party modules to named
		 * cacheable chunks. Groups are matched against each module's resolved
		 * absolute path in the order listed; the first match wins.
		 *
		 * **Ordering rationale:** Rolldown's default `includeDependenciesRecursively`
		 * behaviour means that when a module is captured by a group, its transitive
		 * dependencies are also captured unless they were already claimed by an
		 * earlier group. Placing `vendor-react` first ensures the React runtime is
		 * always assigned to its own chunk, not absorbed into a higher-level library
		 * chunk that depends on it (e.g. `vendor-flow` or `vendor-ui`).
		 */
		rolldownOptions: {
			output: {
				/**
				 * Explicit vendor chunk grouping using the Rolldown `codeSplitting` API.
				 *
				 * Groups are evaluated in dependency order (leaf libraries first) so
				 * that shared transitive dependencies (e.g. React) are consistently
				 * placed in the base chunk rather than being pulled into any of the
				 * higher-level library chunks.
				 *
				 * Priority order (first match wins):
				 *  1. `vendor-react`   — React runtime; depended on by everything else
				 *  2. `vendor-router`  — React Router (depends on React)
				 *  3. `vendor-query`   — TanStack Query (depends on React)
				 *  4. `vendor-zustand` — Zustand state management (depends on React)
				 *  5. `vendor-ui`      — Radix UI, lucide-react, CVA (depend on React)
				 *  6. `vendor-flow`    — React Flow engine (depends on React + Zustand)
				 *  7. `vendor-elk`     — ELK auto-layout (~1.5 MB, Editor-only)
				 *  8. `vendor-misc`    — All other node_modules catch-all
				 */
				codeSplitting: {
					groups: [
						// React runtime — listed first so it is not absorbed into any
						// higher-level library chunk that lists it as a dependency.
						{
							name: "vendor-react",
							test: /node_modules\/(react-dom|react|scheduler)\//,
						},
						// React Router — depends on React.
						{
							name: "vendor-router",
							test: /node_modules\/(react-router-dom|react-router|@remix-run)\//,
						},
						// TanStack Query — server state layer, depends on React.
						{
							name: "vendor-query",
							test: /node_modules\/@tanstack\//,
						},
						// Zustand — state management, depends on React.
						{
							name: "vendor-zustand",
							test: /node_modules\/zustand\//,
						},
						// Radix UI primitives, icon library, and utility classes —
						// used by dashboard and editor, all depend on React.
						{
							name: "vendor-ui",
							test: /node_modules\/(@radix-ui|lucide-react|class-variance-authority|clsx|tailwind-merge)\//,
						},
						// React Flow engine — isolated so it only loads for the Editor
						// route; depends on React and Zustand (both in earlier groups).
						{
							name: "vendor-flow",
							test: /node_modules\/@xyflow\//,
						},
						// ELK auto-layout engine — ~1.5 MB, only fetched for the Editor
						// route. elkjs is a Java-to-JS transpilation of the Eclipse Layout
						// Kernel and is inherently large; it cannot be tree-shaken.
						{
							name: "vendor-elk",
							test: /node_modules\/elkjs\//,
						},
						// All other node_modules fall into a generic vendor chunk.
						{
							name: "vendor-misc",
							test: /node_modules\//,
						},
					],
				},
			},
		},
	},
	// Emit Web Workers as ES modules so that the `elkjs/lib/elk.bundled.js`
	// import resolves correctly inside the worker bundle. Without this setting,
	// Vite defaults to IIFE format for workers which does not support ES module
	// imports inside the worker file.
	worker: {
		format: "es",
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
