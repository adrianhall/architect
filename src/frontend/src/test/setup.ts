/**
 * Vitest global test setup for the frontend workspace.
 *
 * Registers `@testing-library/jest-dom` matchers with Vitest so that
 * component tests can use DOM-specific assertions like `toBeInTheDocument()`,
 * `toHaveTextContent()`, and `toBeVisible()` without any per-test imports.
 *
 * Also registers `@testing-library/react`'s `cleanup` as an `afterEach` hook.
 * Without this, unmounting of React trees does not happen automatically when
 * Vitest globals are not enabled (`globals: true` is not set in vitest.config.ts),
 * causing DOM state from one test to leak into the next.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
	cleanup();
});
