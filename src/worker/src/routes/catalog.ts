import type { CatalogData } from "@architect/shared";
import { Hono } from "hono";
import catalogRaw from "../../../../catalog/services.json";
import { success } from "../lib/response";

/**
 * Casts the imported JSON to the shared {@link CatalogData} type.
 *
 * TypeScript infers the literal types from the JSON (e.g. `style` is
 * `"solid" | "dashed" | ...` in the union). Casting here avoids downstream
 * `as const` gymnastics in the handler while keeping strict type-safety.
 */
const catalog: CatalogData = catalogRaw as CatalogData;

/**
 * Catalog route — `GET /api/catalog`.
 *
 * Returns the full Cloudflare service catalog in a single authenticated
 * request. The response includes:
 * - All service definitions (typeId, names, category, iconPath, docUrl).
 * - All service categories with their display metadata and accent colours.
 * - All edge types available for connections between nodes.
 *
 * Authentication is enforced at the application level: this route is mounted
 * under `/api/*` which is protected by the global auth middleware. An
 * unauthenticated request will receive a `302` redirect (dev) or a `401`
 * response (production) before reaching this handler.
 *
 * The catalog data is imported at build time from `catalog/services.json`
 * and bundled into the Worker by esbuild — there is no runtime file I/O.
 * Adding a new service requires only a data-file change (`catalog/services.json`
 * + the corresponding SVG icon) followed by a redeploy.
 *
 * @example
 * ```ts
 * // Mount on the main app:
 * app.route("/api/catalog", catalog);
 * // GET /api/catalog → { data: { services: [...], categories: [...], edgeTypes: [...] } }
 * ```
 */
const catalogRouter = new Hono();

/**
 * GET /
 *
 * Returns the full catalog in the standard success envelope.
 * Requires authentication (enforced globally by the auth middleware).
 *
 * @returns `{ data: CatalogData }` with HTTP 200.
 */
catalogRouter.get("/", (c) => {
	return c.json(success(catalog));
});

export default catalogRouter;
