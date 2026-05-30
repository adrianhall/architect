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
