import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";

/**
 * Smoke tests for the root App component.
 *
 * Verifies that the React app renders the CF-Architect heading so that any
 * break in the component tree (missing imports, JSX transform issues, Tailwind
 * plugin errors) surfaces immediately in CI.
 */
describe("App", () => {
	it("renders the CF-Architect heading", () => {
		render(<App />);
		expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("CF-Architect");
	});
});
