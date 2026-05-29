import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "../../../test/query-wrapper";
import {
	useCreateDiagram,
	useDeleteDiagram,
	useDiagram,
	useDuplicateDiagram,
	useListDiagrams,
	useRenameDiagram,
	useUpdateDiagram,
} from "../useDiagrams";

const mockDiagram = {
	id: "01DIAGRAM",
	user_id: "01USER",
	title: "Test Diagram",
	graph_data: {
		nodes: [] as unknown[],
		edges: [] as unknown[],
		viewport: { x: 0, y: 0, zoom: 1 },
	},
	version: 1,
	created_at: 1000,
	updated_at: 1000,
};

describe("useListDiagrams", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it("fetches and returns diagram list", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(JSON.stringify({ data: [mockDiagram] }), { status: 200 }),
		);

		const { Wrapper } = createQueryWrapper();
		const { result } = renderHook(() => useListDiagrams(), { wrapper: Wrapper });

		await waitFor(() => {
			expect(result.current.isSuccess).toBe(true);
		});

		expect(result.current.data).toHaveLength(1);
		expect(result.current.data?.[0].title).toBe("Test Diagram");
	});

	it("starts in loading state", () => {
		vi.spyOn(globalThis, "fetch").mockReturnValue(new Promise(() => {}));

		const { Wrapper } = createQueryWrapper();
		const { result } = renderHook(() => useListDiagrams(), { wrapper: Wrapper });

		expect(result.current.isLoading).toBe(true);
	});
});

describe("useDiagram", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it("fetches a single diagram by id", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(JSON.stringify({ data: mockDiagram }), { status: 200 }),
		);

		const { Wrapper } = createQueryWrapper();
		const { result } = renderHook(() => useDiagram("01DIAGRAM"), { wrapper: Wrapper });

		await waitFor(() => {
			expect(result.current.isSuccess).toBe(true);
		});

		expect(result.current.data?.id).toBe("01DIAGRAM");
	});

	it("is disabled when id is empty string", () => {
		const fetchSpy = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(new Response(JSON.stringify({ data: mockDiagram }), { status: 200 }));

		const { Wrapper } = createQueryWrapper();
		renderHook(() => useDiagram(""), { wrapper: Wrapper });

		// fetch should not be called since enabled = false
		expect(fetchSpy).not.toHaveBeenCalled();
	});
});

describe("useCreateDiagram", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it("creates a diagram and returns the new diagram", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(JSON.stringify({ data: mockDiagram }), { status: 201 }),
		);

		const { Wrapper } = createQueryWrapper();
		const { result } = renderHook(() => useCreateDiagram(), { wrapper: Wrapper });

		await act(async () => {
			const diagram = await result.current.mutateAsync({ title: "Test Diagram" });
			expect(diagram.id).toBe("01DIAGRAM");
			expect(diagram.title).toBe("Test Diagram");
		});
	});

	it("invalidates the diagrams query key on success", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(JSON.stringify({ data: mockDiagram }), { status: 201 }),
		);

		const { Wrapper, queryClient } = createQueryWrapper();
		const { result } = renderHook(() => useCreateDiagram(), { wrapper: Wrapper });
		const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

		await act(async () => {
			await result.current.mutateAsync({ title: "Test Diagram" });
		});

		expect(invalidateSpy).toHaveBeenCalled();
	});
});

describe("useUpdateDiagram", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it("updates a diagram and returns the updated data", async () => {
		const updated = { ...mockDiagram, title: "Updated", version: 2 };
		vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ data: updated }), { status: 200 }));

		const { Wrapper } = createQueryWrapper();
		const { result } = renderHook(() => useUpdateDiagram(), { wrapper: Wrapper });

		await act(async () => {
			const data = await result.current.mutateAsync({
				id: "01DIAGRAM",
				title: "Updated",
				graph_data: mockDiagram.graph_data,
				version: 1,
			});
			expect(data.title).toBe("Updated");
		});
	});

	it("invalidates the cache on success", async () => {
		const updated = { ...mockDiagram, title: "Updated", version: 2 };
		vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ data: updated }), { status: 200 }));

		const { Wrapper, queryClient } = createQueryWrapper();
		const { result } = renderHook(() => useUpdateDiagram(), { wrapper: Wrapper });
		const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

		await act(async () => {
			await result.current.mutateAsync({
				id: "01DIAGRAM",
				title: "Updated",
				graph_data: mockDiagram.graph_data,
				version: 1,
			});
		});

		expect(invalidateSpy).toHaveBeenCalled();
	});
});

describe("useRenameDiagram", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it("renames a diagram and returns the updated diagram", async () => {
		const renamed = { ...mockDiagram, title: "Renamed" };
		vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ data: renamed }), { status: 200 }));

		const { Wrapper } = createQueryWrapper();
		const { result } = renderHook(() => useRenameDiagram(), { wrapper: Wrapper });

		await act(async () => {
			const data = await result.current.mutateAsync({ id: "01DIAGRAM", title: "Renamed" });
			expect(data.title).toBe("Renamed");
		});
	});

	it("invalidates the diagram and list query keys on success", async () => {
		const renamed = { ...mockDiagram, title: "Renamed" };
		vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ data: renamed }), { status: 200 }));

		const { Wrapper, queryClient } = createQueryWrapper();
		const { result } = renderHook(() => useRenameDiagram(), { wrapper: Wrapper });
		const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

		await act(async () => {
			await result.current.mutateAsync({ id: "01DIAGRAM", title: "Renamed" });
		});

		expect(invalidateSpy).toHaveBeenCalledTimes(2);
	});
});

describe("useDuplicateDiagram", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it("duplicates a diagram and returns the new copy", async () => {
		const duplicated = { ...mockDiagram, id: "01COPY", title: "Test Diagram (Copy)" };
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(JSON.stringify({ data: duplicated }), { status: 201 }),
		);

		const { Wrapper } = createQueryWrapper();
		const { result } = renderHook(() => useDuplicateDiagram(), { wrapper: Wrapper });

		await act(async () => {
			const newDiagram = await result.current.mutateAsync({ id: "01DIAGRAM" });
			expect(newDiagram.id).toBe("01COPY");
			expect(newDiagram.title).toBe("Test Diagram (Copy)");
		});
	});

	it("invalidates the diagrams list on success", async () => {
		const duplicated = { ...mockDiagram, id: "01COPY" };
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(JSON.stringify({ data: duplicated }), { status: 201 }),
		);

		const { Wrapper, queryClient } = createQueryWrapper();
		const { result } = renderHook(() => useDuplicateDiagram(), { wrapper: Wrapper });
		const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

		await act(async () => {
			await result.current.mutateAsync({ id: "01DIAGRAM" });
		});

		expect(invalidateSpy).toHaveBeenCalled();
	});
});

describe("useDeleteDiagram", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it("deletes a diagram (204 response)", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));

		const { Wrapper } = createQueryWrapper();
		const { result } = renderHook(() => useDeleteDiagram(), { wrapper: Wrapper });

		await act(async () => {
			await result.current.mutateAsync({ id: "01DIAGRAM" });
		});

		await waitFor(() => {
			expect(result.current.isSuccess).toBe(true);
		});
	});

	it("removes the diagram from cache and invalidates the list on success", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));

		const { Wrapper, queryClient } = createQueryWrapper();
		const { result } = renderHook(() => useDeleteDiagram(), { wrapper: Wrapper });
		const removeSpy = vi.spyOn(queryClient, "removeQueries");
		const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

		await act(async () => {
			await result.current.mutateAsync({ id: "01DIAGRAM" });
		});

		expect(removeSpy).toHaveBeenCalled();
		expect(invalidateSpy).toHaveBeenCalled();
	});
});
