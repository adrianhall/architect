/**
 * Shared catalog types for the @architect/shared package.
 *
 * These types describe the Cloudflare service catalog: the services
 * themselves, the categories they belong to, and the edge types available
 * for connections between services on the canvas.
 *
 * Both the worker (for serving `GET /api/catalog`) and the frontend (for
 * rendering the service palette and canvas nodes) import from this module.
 */

/**
 * A single Cloudflare service entry in the catalog.
 *
 * Each service corresponds to a node type that users can drag onto the
 * architecture canvas. The `typeId` is used as the React Flow node type
 * identifier and must be unique across the catalog.
 *
 * @example
 * const workers: CatalogService = {
 *   typeId: "workers",
 *   officialName: "Cloudflare Workers",
 *   shortName: "Workers",
 *   category: "developer-platform",
 *   iconPath: "workers.svg",
 *   docUrl: "https://developers.cloudflare.com/workers/",
 * };
 */
export interface CatalogService {
	/** Unique identifier, lowercase-kebab-case (e.g. "workers", "d1", "r2"). */
	typeId: string;
	/** Official product name displayed in tooltips (e.g. "Cloudflare Workers"). */
	officialName: string;
	/** Short display name for canvas nodes and the service palette (e.g. "Workers"). */
	shortName: string;
	/** Category ID this service belongs to (must match a `CatalogCategory.id`). */
	category: string;
	/**
	 * Relative filename of the SVG icon within the `catalog/icons/` directory
	 * (e.g. `"workers.svg"`). The icon is served by the Worker at
	 * `/catalog/icons/<iconPath>` and rendered inside canvas nodes.
	 */
	iconPath: string;
	/** URL to the official Cloudflare documentation page for this service. */
	docUrl: string;
}

/**
 * A service category with display metadata.
 *
 * Categories group related Cloudflare services in the palette sidebar and
 * determine the accent colour applied to canvas nodes.
 *
 * @example
 * const devPlatform: CatalogCategory = {
 *   id: "developer-platform",
 *   label: "Developer Platform",
 *   color: "#2563eb",
 * };
 */
export interface CatalogCategory {
	/** Unique identifier used as a foreign key in `CatalogService.category`. */
	id: string;
	/** Human-readable label shown in the palette sidebar section header. */
	label: string;
	/**
	 * Hex colour string applied as the accent colour for all nodes in this
	 * category (e.g. `"#2563eb"` for blue).
	 */
	color: string;
}

/**
 * A catalog edge type object describing how two services can be connected.
 *
 * Each entry maps to a distinct visual style so users can communicate the
 * nature of a connection (e.g. a binding vs. a data flow).
 *
 * Note: `diagram.ts` exports a *union* type named `EdgeType` for use as the
 * `DiagramEdge.type` discriminant (`"data-flow" | "binding" | ...`). This
 * interface is named `CatalogEdgeType` to avoid an export-name collision in
 * the barrel `index.ts`.
 *
 * @example
 * const binding: CatalogEdgeType = {
 *   id: "binding",
 *   label: "Binding",
 *   style: "dashed",
 * };
 */
export interface CatalogEdgeType {
	/** Unique identifier used as the React Flow edge `type` prop. */
	id: string;
	/** Human-readable label shown in the edge type selector in the properties panel. */
	label: string;
	/**
	 * Visual rendering hint for this edge type:
	 * - `"solid"` — continuous line (data flow)
	 * - `"dashed"` — dashed line (binding)
	 * - `"dotted"` — dotted line (trigger)
	 * - `"animated"` — animated moving dashes (dependency)
	 */
	style: "solid" | "dashed" | "dotted" | "animated";
}

/**
 * The full catalog payload returned by `GET /api/catalog`.
 *
 * Wraps all services, categories, and edge types in a single object so the
 * frontend can hydrate the palette and edge-type selector in one request.
 *
 * @example
 * const catalog: CatalogData = {
 *   services: [...],
 *   categories: [...],
 *   edgeTypes: [...],
 * };
 */
export interface CatalogData {
	/** All Cloudflare services available in the catalog. */
	services: CatalogService[];
	/** All service categories with their display metadata. */
	categories: CatalogCategory[];
	/** All catalog edge type definitions available for connections between nodes. */
	edgeTypes: CatalogEdgeType[];
}
