import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

/**
 * Creates a fresh `QueryClient` and React wrapper component for use in
 * Vitest tests that involve TanStack Query hooks.
 *
 * A new `QueryClient` is created for each call so tests start with an empty
 * cache and cannot interfere with each other. Both queries and mutations are
 * configured with `retry: false` to prevent retries from causing test timeouts
 * or unexpected extra `fetch` calls.
 *
 * @returns An object containing:
 *   - `queryClient` — the fresh `QueryClient` instance; useful for spying on
 *     `invalidateQueries` / `removeQueries` in mutation tests.
 *   - `Wrapper` — a React component that wraps its `children` in a
 *     `QueryClientProvider` backed by `queryClient`. Pass as the `wrapper`
 *     option to `renderHook`.
 *
 * @example
 * ```tsx
 * const { Wrapper, queryClient } = createQueryWrapper();
 * const { result } = renderHook(() => useMe(), { wrapper: Wrapper });
 *
 * await waitFor(() => expect(result.current.isSuccess).toBe(true));
 * ```
 */
export function createQueryWrapper() {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: { retry: false },
			mutations: { retry: false },
		},
	});

	function Wrapper({ children }: { children: ReactNode }) {
		return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
	}

	return { queryClient, Wrapper };
}
