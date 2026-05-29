/**
 * Vitest global test setup for the frontend workspace.
 *
 * Registers `@testing-library/jest-dom` matchers with Vitest so that
 * component tests can use DOM-specific assertions like `toBeInTheDocument()`,
 * `toHaveTextContent()`, and `toBeVisible()` without any per-test imports.
 */
import "@testing-library/jest-dom/vitest";
