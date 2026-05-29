import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import type { CatalogCategory, CatalogData, CatalogEdgeType, CatalogService } from "../catalog.js";

/**
 * Load `catalog/services.json` via Node's `createRequire` so we can validate
 * the raw data file without triggering TypeScript `rootDir` constraints (JSON
 * files outside `rootDir` are not emittable and would break the composite
 * project build if imported with a static `import` statement).
 */
const require = createRequire(import.meta.url);
const catalogData: CatalogData = require("../../../../catalog/services.json") as CatalogData;

/**
 * Validation tests for `catalog/services.json`.
 *
 * These tests treat the JSON file as the source of truth and verify that it
 * satisfies every structural and semantic constraint required by the
 * {@link CatalogData} type and the acceptance criteria for ISSUE-08.
 *
 * They deliberately do NOT test implementation details of the Worker route
 * (that is covered in the worker-project catalog route tests).  The tests
 * here verify only the *data file* so a future data-only change (adding a
 * service, updating a docUrl) immediately shows up as a failing test if the
 * schema contract is broken.
 */

describe("catalog/services.json — structural validation", () => {
	it("contains at least 27 services", () => {
		expect(catalogData.services.length).toBeGreaterThanOrEqual(27);
	});

	it("contains exactly 4 categories", () => {
		expect(catalogData.categories).toHaveLength(4);
	});

	it("contains exactly 4 edge types", () => {
		expect(catalogData.edgeTypes).toHaveLength(4);
	});

	it("all services have required non-empty string fields", () => {
		const fields: (keyof CatalogService)[] = ["typeId", "officialName", "shortName", "category", "iconPath", "docUrl"];

		for (const service of catalogData.services) {
			for (const field of fields) {
				expect(service[field], `service "${service.typeId}" is missing field "${field}"`).toBeTruthy();
				expect(typeof service[field], `service "${service.typeId}" field "${field}" must be a string`).toBe("string");
			}
		}
	});

	it("all typeIds are unique", () => {
		const ids = catalogData.services.map((s) => s.typeId);
		const unique = new Set(ids);
		expect(unique.size).toBe(ids.length);
	});

	it("all typeIds are lowercase-kebab-case", () => {
		const kebabCase = /^[a-z][a-z0-9-]*$/;
		for (const service of catalogData.services) {
			expect(service.typeId, `typeId "${service.typeId}" must be lowercase-kebab-case`).toMatch(kebabCase);
		}
	});

	it("all service category references resolve to a known category", () => {
		const categoryIds = new Set(catalogData.categories.map((c) => c.id));
		for (const service of catalogData.services) {
			expect(
				categoryIds.has(service.category),
				`service "${service.typeId}" references unknown category "${service.category}"`,
			).toBe(true);
		}
	});

	it("all docUrls start with https://", () => {
		for (const service of catalogData.services) {
			expect(service.docUrl, `service "${service.typeId}" docUrl must start with https://`).toMatch(/^https:\/\//);
		}
	});
});

describe("catalog/services.json — category colours", () => {
	/** Returns the category with the given id, or throws if not found. */
	function findCategory(id: string): CatalogCategory {
		const cat = catalogData.categories.find((c) => c.id === id);
		expect(cat, `category "${id}" not found`).toBeDefined();
		return cat as CatalogCategory;
	}

	it("developer-platform category has blue colour #2563eb", () => {
		expect(findCategory("developer-platform").color).toBe("#2563eb");
	});

	it("zero-trust category has green colour #16a34a", () => {
		expect(findCategory("zero-trust").color).toBe("#16a34a");
	});

	it("cdn-application category has orange colour #ea580c", () => {
		expect(findCategory("cdn-application").color).toBe("#ea580c");
	});

	it("other category has gray colour #6b7280", () => {
		expect(findCategory("other").color).toBe("#6b7280");
	});
});

describe("catalog/services.json — edge types", () => {
	const REQUIRED_IDS = ["data-flow", "binding", "trigger", "dependency"] as const;
	const VALID_STYLES: CatalogEdgeType["style"][] = ["solid", "dashed", "dotted", "animated"];

	it("contains all required edge type ids", () => {
		const ids = new Set(catalogData.edgeTypes.map((e) => e.id));
		for (const required of REQUIRED_IDS) {
			expect(ids.has(required), `edge type "${required}" is missing`).toBe(true);
		}
	});

	it("all edge types have valid style values", () => {
		for (const edgeType of catalogData.edgeTypes) {
			expect(VALID_STYLES, `edge type "${edgeType.id}" has invalid style "${edgeType.style}"`).toContain(
				edgeType.style,
			);
		}
	});

	it("edge type data-flow uses solid style", () => {
		const dt = catalogData.edgeTypes.find((e) => e.id === "data-flow");
		expect(dt?.style).toBe("solid");
	});

	it("edge type binding uses dashed style", () => {
		const dt = catalogData.edgeTypes.find((e) => e.id === "binding");
		expect(dt?.style).toBe("dashed");
	});

	it("edge type trigger uses dotted style", () => {
		const dt = catalogData.edgeTypes.find((e) => e.id === "trigger");
		expect(dt?.style).toBe("dotted");
	});

	it("edge type dependency uses animated style", () => {
		const dt = catalogData.edgeTypes.find((e) => e.id === "dependency");
		expect(dt?.style).toBe("animated");
	});
});

describe("catalog/services.json — service distribution", () => {
	it("has at least 15 developer-platform services", () => {
		const count = catalogData.services.filter((s) => s.category === "developer-platform").length;
		expect(count).toBeGreaterThanOrEqual(15);
	});

	it("has at least 4 zero-trust services", () => {
		const count = catalogData.services.filter((s) => s.category === "zero-trust").length;
		expect(count).toBeGreaterThanOrEqual(4);
	});

	it("has at least 8 cdn-application services", () => {
		const count = catalogData.services.filter((s) => s.category === "cdn-application").length;
		expect(count).toBeGreaterThanOrEqual(8);
	});
});
