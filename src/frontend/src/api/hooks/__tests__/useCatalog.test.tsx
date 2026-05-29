import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "../../../test/query-wrapper";
import { useCatalog } from "../useCatalog";

const mockCatalog = {
	services: [{ id: "workers", name: "Workers" }],
	categories: [{ id: "developer", name: "Developer Platform" }],
	edgeTypes: [{ id: "data-flow", label: "Data Flow" }],
};

describe("useCatalog", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it("fetches and returns catalog data", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(JSON.stringify({ data: mockCatalog }), { status: 200 }),
		);

		const { Wrapper } = createQueryWrapper();
		const { result } = renderHook(() => useCatalog(), { wrapper: Wrapper });

		await waitFor(() => {
			expect(result.current.isSuccess).toBe(true);
		});

		expect(result.current.data?.services).toHaveLength(1);
		expect(result.current.data?.categories).toHaveLength(1);
		expect(result.current.data?.edgeTypes).toHaveLength(1);
	});

	it("starts in loading state", () => {
		vi.spyOn(globalThis, "fetch").mockReturnValue(new Promise(() => {}));

		const { Wrapper } = createQueryWrapper();
		const { result } = renderHook(() => useCatalog(), { wrapper: Wrapper });

		expect(result.current.isLoading).toBe(true);
	});

	it("fetches catalog exactly once (staleTime: Infinity prevents refetch)", async () => {
		const fetchSpy = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(new Response(JSON.stringify({ data: mockCatalog }), { status: 200 }));

		const { Wrapper } = createQueryWrapper();

		// Mount the hook twice with the same wrapper (same query client / cache)
		const { result: r1 } = renderHook(() => useCatalog(), { wrapper: Wrapper });
		const { result: r2 } = renderHook(() => useCatalog(), { wrapper: Wrapper });

		await waitFor(() => {
			expect(r1.current.isSuccess).toBe(true);
		});
		await waitFor(() => {
			expect(r2.current.isSuccess).toBe(true);
		});

		// Both hook instances share the same query, so fetch fires only once.
		expect(fetchSpy).toHaveBeenCalledTimes(1);
	});
});
