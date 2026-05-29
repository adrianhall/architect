import { describe, expect, it } from "vitest";

/**
 * Smoke tests for the worker entry point module.
 *
 * These tests exist solely to validate Vitest project wiring (correct test
 * environment, workspace resolution, project filtering via `--project worker`).
 * Functional tests will be added in later issues when routes are implemented.
 */
describe("worker entry", () => {
	it("should export a default fetch handler", async () => {
		const mod = await import("./index.js");
		expect(mod.default).toBeDefined();
		expect(mod.default.fetch).toBeInstanceOf(Function);
	});

	it("fetch handler returns 200 with placeholder body", async () => {
		const mod = await import("./index.js");
		const response = await mod.default.fetch(new Request("http://localhost/"), {}, {} as ExecutionContext);
		expect(response.status).toBe(200);
		expect(await response.text()).toBe("CF-Architect API — not yet implemented");
	});
});
