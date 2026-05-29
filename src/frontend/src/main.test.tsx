import { describe, expect, it } from "vitest";
import { App } from "./main.js";

/**
 * Smoke tests for the frontend entry point module.
 *
 * These tests exist solely to validate Vitest project wiring (jsdom environment,
 * workspace resolution, JSX transform, project filtering via `--project frontend`).
 * Functional component tests will be added in later issues.
 */
describe("frontend entry", () => {
	it("should export an App component", () => {
		expect(App).toBeInstanceOf(Function);
	});

	it("App renders a div with placeholder text", () => {
		const element = App();
		expect(element.type).toBe("div");
		expect(element.props.children).toBe("CF-Architect — not yet implemented");
	});
});
