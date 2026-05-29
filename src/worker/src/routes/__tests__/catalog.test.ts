import type { CatalogData } from "@architect/shared";
import { describe, expect, it } from "vitest";
import app from "../../index";
import { JWT_HEADER, signDevJwt } from "../../test/helpers";

/**
 * Integration tests for `GET /api/catalog`.
 *
 * Exercises the full middleware chain (auth check + catalog handler) through
 * the main app entry point. The catalog data is bundled at build time, so
 * these tests verify both the route wiring and the structural guarantees of
 * the bundled data.
 *
 * The test env comes from `wrangler.test.jsonc`, which sets:
 * - `CLOUDFLARE_TEAM_DOMAIN = "test.cloudflareaccess.com"`
 * - `SEED_ADMIN_EMAIL = "admin@test.com"`
 */

/** Minimal env with bindings required by the auth middleware. */
const TEST_ENV = {
	CLOUDFLARE_TEAM_DOMAIN: "test.cloudflareaccess.com",
	SEED_ADMIN_EMAIL: "admin@test.com",
};

/** Expected category colours indexed by category id. */
const CATEGORY_COLOURS: Record<string, string> = {
	"developer-platform": "#2563eb",
	"zero-trust": "#16a34a",
	"cdn-application": "#ea580c",
	other: "#6b7280",
};

/** The four required edge type ids. */
const REQUIRED_EDGE_IDS = ["data-flow", "binding", "trigger", "dependency"] as const;

describe("GET /api/catalog — authentication", () => {
	it("returns 302 redirect without authentication (dev mode)", async () => {
		const res = await app.fetch(new Request("http://localhost/api/catalog"), TEST_ENV);
		// Dev auth middleware redirects unauthenticated requests to the PIN login page.
		expect(res.status).toBe(302);
	});

	it("returns 200 with a valid dev JWT", async () => {
		const token = await signDevJwt("user@example.com");
		const res = await app.fetch(
			new Request("http://localhost/api/catalog", {
				headers: { [JWT_HEADER]: token },
			}),
			TEST_ENV,
		);
		expect(res.status).toBe(200);
	});
});

describe("GET /api/catalog — response shape", () => {
	/** Make an authenticated GET /api/catalog request and return the parsed body. */
	async function fetchCatalog(): Promise<{ data: CatalogData }> {
		const token = await signDevJwt("user@example.com");
		const res = await app.fetch(
			new Request("http://localhost/api/catalog", {
				headers: { [JWT_HEADER]: token },
			}),
			TEST_ENV,
		);
		return res.json() as Promise<{ data: CatalogData }>;
	}

	it("response has data.services array", async () => {
		const body = await fetchCatalog();
		expect(Array.isArray(body.data.services)).toBe(true);
	});

	it("response has data.categories array", async () => {
		const body = await fetchCatalog();
		expect(Array.isArray(body.data.categories)).toBe(true);
	});

	it("response has data.edgeTypes array", async () => {
		const body = await fetchCatalog();
		expect(Array.isArray(body.data.edgeTypes)).toBe(true);
	});

	it("returns at least 27 services", async () => {
		const body = await fetchCatalog();
		expect(body.data.services.length).toBeGreaterThanOrEqual(27);
	});

	it("services have all required fields", async () => {
		const body = await fetchCatalog();
		// Spot-check the first five services for required fields.
		const sample = body.data.services.slice(0, 5);
		for (const service of sample) {
			expect(service.typeId).toBeTruthy();
			expect(service.officialName).toBeTruthy();
			expect(service.shortName).toBeTruthy();
			expect(service.category).toBeTruthy();
			expect(service.iconPath).toBeTruthy();
			expect(service.docUrl).toBeTruthy();
		}
	});

	it("includes the workers service", async () => {
		const body = await fetchCatalog();
		const workers = body.data.services.find((s) => s.typeId === "workers");
		expect(workers).toBeDefined();
		expect(workers?.officialName).toBe("Cloudflare Workers");
		expect(workers?.category).toBe("developer-platform");
	});

	it("returns exactly 4 edge types", async () => {
		const body = await fetchCatalog();
		expect(body.data.edgeTypes).toHaveLength(4);
	});

	it("returns all required edge type ids", async () => {
		const body = await fetchCatalog();
		const ids = new Set(body.data.edgeTypes.map((e) => e.id));
		for (const required of REQUIRED_EDGE_IDS) {
			expect(ids.has(required), `edge type "${required}" missing`).toBe(true);
		}
	});

	it("returns exactly 4 categories", async () => {
		const body = await fetchCatalog();
		expect(body.data.categories).toHaveLength(4);
	});

	it("categories have correct colours", async () => {
		const body = await fetchCatalog();
		for (const [id, expectedColor] of Object.entries(CATEGORY_COLOURS)) {
			const cat = body.data.categories.find((c) => c.id === id);
			expect(cat, `category "${id}" not found`).toBeDefined();
			expect(cat?.color, `category "${id}" has wrong color`).toBe(expectedColor);
		}
	});
});
