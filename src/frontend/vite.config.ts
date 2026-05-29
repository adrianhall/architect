import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * Vite configuration for the CF-Architect frontend.
 *
 * - Output is sent to `../worker/public/` so the Cloudflare Worker can serve
 *   the built SPA via `c.env.ASSETS.fetch()` without any additional tooling.
 * - The `@/` alias mirrors the TypeScript path alias in `tsconfig.json`,
 *   matching shadcn's convention of `@/components/ui/button` imports.
 * - During Vite dev mode (`npm run start:frontend`), `/api/*` and `/_auth/*`
 *   requests are proxied to the wrangler dev server on port 8787. In
 *   production, the Worker handles both assets and API directly.
 */
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
