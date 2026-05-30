import { copyFileSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { defineConfig } from "vite";

/**
 * Custom Vite plugin that copies the Cloudflare service catalog SVG icons from
 * `catalog/icons/` (repo root) into `<outDir>/catalog/icons/` after every
 * production build.
 *
 * **Why this is necessary:**
 * The Workers ASSETS binding (`c.env.ASSETS.fetch()`) only serves files that
 * exist inside the configured `directory` (i.e. `src/worker/public/`). Vite
 * bundles only files that are imported or referenced inside the React source
 * tree. The catalog SVGs are *not* imported — they are referenced at runtime
 * as `src="/catalog/icons/<iconPath>"` strings returned by the API. Without
 * this plugin, every icon request falls through to the SPA fallback and
 * returns `index.html` instead of the SVG.
 *
 * **Why a plugin rather than an npm script:**
 * Using `closeBundle()` ties the copy directly to the Vite build lifecycle.
 * The copy runs after `emptyOutDir: true` cleans the output directory, so
 * icons are always present in the freshly built `public/` tree. A separate
 * npm script step could be run before the clean and lose the icons.
 *
 * @returns A Vite plugin that copies catalog icons on `closeBundle`.
 */
function copyCatalogIcons(): Plugin {
	const iconsDir = path.resolve(__dirname, "../../catalog/icons");
	const outIconsDir = path.resolve(__dirname, "../worker/public/catalog/icons");

	return {
		name: "copy-catalog-icons",

		/**
		 * Runs after the bundle is written to disk (production build only).
		 * Creates the destination directory if absent, then copies every file
		 * from `catalog/icons/` verbatim.
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
 * - `manualChunks` splits third-party libraries into named, individually
 *   cacheable chunks. Most importantly, `vendor-flow` (`@xyflow/react`) is
 *   isolated so it is **only** fetched when the user navigates to
 *   `/editor/:id` — all other routes skip the ~220 kB canvas engine.
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
		rollupOptions: {
			output: {
				/**
				 * Explicit vendor chunk grouping.
				 *
				 * The function form is required so that transitive `node_modules`
				 * imports are assigned to the correct chunk — Rollup passes the
				 * resolved module id (absolute file path) for every module it
				 * processes.
				 *
				 * Priority matters: the first matching branch wins. More specific
				 * prefixes come first to prevent a library from being absorbed into
				 * a broader group (e.g. `@xyflow/react` must not fall into a generic
				 * `@*` catch-all before `vendor-flow` matches).
				 *
				 * @param id - Absolute resolved module path passed by Rollup.
				 * @returns The chunk name to place this module into, or `undefined`
				 *   to let Rollup decide (used for app source files).
				 */
				manualChunks(id: string): string | undefined {
					// React Flow engine — isolated so it only loads for the Editor route.
					if (id.includes("node_modules/@xyflow/")) {
						return "vendor-flow";
					}
					// Zustand state management — co-located with editor code.
					if (id.includes("node_modules/zustand/")) {
						return "vendor-zustand";
					}
					// ELK auto-layout engine — ~1.5 MB, only fetched for the Editor route.
					// elkjs/lib/elk.bundled.js is a Java-to-JS transpilation of the Eclipse
					// Layout Kernel and is inherently large; it cannot be tree-shaken.
					if (id.includes("node_modules/elkjs/")) {
						return "vendor-elk";
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
