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
 *
 * Installs a no-op `Worker` stub on `globalThis` so that components which
 * create Web Workers (e.g. `useAutoLayout`) do not throw
 * `ReferenceError: Worker is not defined` in the jsdom environment.
 * Tests that need a controllable fake `Worker` (e.g. `useAutoLayout.test.ts`)
 * override this stub in their own `beforeEach` via `Object.defineProperty`.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

/**
 * Minimal no-op `Worker` stub for jsdom.
 *
 * jsdom does not implement the `Worker` API. This stub prevents
 * `ReferenceError: Worker is not defined` when components that use
 * `new Worker(...)` are rendered in tests. The stub accepts any constructor
 * arguments and exposes the standard `Worker` interface as no-ops.
 *
 * Tests that need to control `Worker` behaviour (e.g. `useAutoLayout.test.ts`)
 * overwrite this global in their own `beforeEach` blocks.
 */
class WorkerStub {
	// biome-ignore lint/complexity/noUselessConstructor: constructor parameters are required to match the Worker API signature accepted by the hook under test
	constructor(_url: string | URL, _opts?: WorkerOptions) {}
	postMessage(_data: unknown): void {}
	terminate(): void {}
	addEventListener(_type: string, _listener: EventListenerOrEventListenerObject): void {}
	removeEventListener(_type: string, _listener: EventListenerOrEventListenerObject): void {}
}

Object.defineProperty(globalThis, "Worker", {
	writable: true,
	configurable: true,
	value: WorkerStub,
});

afterEach(() => {
	cleanup();
});
