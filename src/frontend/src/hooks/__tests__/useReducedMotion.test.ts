import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useReducedMotion } from "../useReducedMotion";

/**
 * A minimal fake `MediaQueryList` that supports `addEventListener` /
 * `removeEventListener` and tracks registered change handlers so tests can
 * simulate the OS "Reduce Motion" toggle.
 *
 * JSDOM does not implement `window.matchMedia`, so we install our own
 * implementation via `Object.defineProperty` in `beforeEach`.
 */
interface FakeMediaQueryList {
	matches: boolean;
	addEventListener: ReturnType<typeof vi.fn>;
	removeEventListener: ReturnType<typeof vi.fn>;
	/** Simulate the user toggling the OS reduce-motion setting. */
	fireChange: (newMatches: boolean) => void;
}

function makeFakeMql(initialMatches: boolean): FakeMediaQueryList {
	const handlers: Array<(e: MediaQueryListEvent) => void> = [];

	const mql: FakeMediaQueryList = {
		matches: initialMatches,
		addEventListener: vi.fn((_type: string, handler: (e: MediaQueryListEvent) => void) => {
			handlers.push(handler);
		}),
		removeEventListener: vi.fn((_type: string, handler: (e: MediaQueryListEvent) => void) => {
			const idx = handlers.indexOf(handler);
			if (idx !== -1) handlers.splice(idx, 1);
		}),
		fireChange(newMatches: boolean) {
			mql.matches = newMatches;
			for (const h of handlers) {
				h({ matches: newMatches } as MediaQueryListEvent);
			}
		},
	};

	return mql;
}

let fakeMql: FakeMediaQueryList;

/** Installs the fake matchMedia on window so the hook can call it. */
function installFakeMql(initialMatches: boolean): FakeMediaQueryList {
	const mql = makeFakeMql(initialMatches);
	Object.defineProperty(window, "matchMedia", {
		writable: true,
		configurable: true,
		value: vi.fn(() => mql),
	});
	return mql;
}

describe("useReducedMotion", () => {
	beforeEach(() => {
		fakeMql = installFakeMql(false);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("returns false when prefers-reduced-motion does not match initially", () => {
		fakeMql = installFakeMql(false);
		const { result } = renderHook(() => useReducedMotion());
		expect(result.current).toBe(false);
	});

	it("returns true when prefers-reduced-motion matches initially", () => {
		fakeMql = installFakeMql(true);
		const { result } = renderHook(() => useReducedMotion());
		expect(result.current).toBe(true);
	});

	it("subscribes to MediaQueryList change events on mount", () => {
		renderHook(() => useReducedMotion());
		expect(fakeMql.addEventListener).toHaveBeenCalledWith("change", expect.any(Function));
	});

	it("updates to true when the OS setting changes to reduce motion", () => {
		const { result } = renderHook(() => useReducedMotion());
		expect(result.current).toBe(false);

		act(() => {
			fakeMql.fireChange(true);
		});

		expect(result.current).toBe(true);
	});

	it("updates to false when the OS setting changes back to allow motion", () => {
		fakeMql = installFakeMql(true);
		const { result } = renderHook(() => useReducedMotion());
		expect(result.current).toBe(true);

		act(() => {
			fakeMql.fireChange(false);
		});

		expect(result.current).toBe(false);
	});

	it("removes the change listener on unmount", () => {
		const { unmount } = renderHook(() => useReducedMotion());
		unmount();
		expect(fakeMql.removeEventListener).toHaveBeenCalledWith("change", expect.any(Function));
	});
});
