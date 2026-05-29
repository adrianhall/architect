import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "../../../test/query-wrapper";
import { useAdminUsers, useDeleteUser, useDemoteUser, usePromoteUser } from "../useAdmin";

const mockAdminUser = {
	id: "01ABC",
	email: "alice@example.com",
	name: "alice",
	avatar_url: null,
	role: "user",
	diagram_count: 3,
	created_at: 1000,
	updated_at: 1000,
};

const mockUsersResponse = {
	users: [mockAdminUser],
	pagination: {
		page: 1,
		limit: 20,
		total: 1,
		totalPages: 1,
	},
};

describe("useAdminUsers", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it("fetches paginated user list", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(JSON.stringify({ data: mockUsersResponse }), { status: 200 }),
		);

		const { Wrapper } = createQueryWrapper();
		const { result } = renderHook(() => useAdminUsers({ page: 1 }), { wrapper: Wrapper });

		await waitFor(() => {
			expect(result.current.isSuccess).toBe(true);
		});

		expect(result.current.data?.users).toHaveLength(1);
		expect(result.current.data?.users[0].email).toBe("alice@example.com");
		expect(result.current.data?.pagination.total).toBe(1);
	});

	it("appends query parameters to the request URL", async () => {
		const fetchSpy = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(new Response(JSON.stringify({ data: mockUsersResponse }), { status: 200 }));

		const { Wrapper } = createQueryWrapper();
		renderHook(() => useAdminUsers({ page: 2, limit: 10, search: "alice" }), { wrapper: Wrapper });

		await waitFor(() => {
			expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining("page=2"), expect.any(Object));
		});
	});

	it("uses plain path when no params are provided", async () => {
		const fetchSpy = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(new Response(JSON.stringify({ data: mockUsersResponse }), { status: 200 }));

		const { Wrapper } = createQueryWrapper();
		renderHook(() => useAdminUsers(), { wrapper: Wrapper });

		await waitFor(() => {
			expect(fetchSpy).toHaveBeenCalledWith("/api/admin/users", expect.any(Object));
		});
	});
});

describe("usePromoteUser", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it("promotes a user to admin and returns the updated user", async () => {
		const promoted = { ...mockAdminUser, role: "admin" };
		vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ data: promoted }), { status: 200 }));

		const { Wrapper } = createQueryWrapper();
		const { result } = renderHook(() => usePromoteUser(), { wrapper: Wrapper });

		await act(async () => {
			const data = await result.current.mutateAsync({ userId: "01ABC" });
			expect(data.role).toBe("admin");
		});
	});

	it("invalidates admin users cache on success", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(JSON.stringify({ data: { ...mockAdminUser, role: "admin" } }), { status: 200 }),
		);

		const { Wrapper, queryClient } = createQueryWrapper();
		const { result } = renderHook(() => usePromoteUser(), { wrapper: Wrapper });
		const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

		await act(async () => {
			await result.current.mutateAsync({ userId: "01ABC" });
		});

		expect(invalidateSpy).toHaveBeenCalled();
	});
});

describe("useDemoteUser", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it("demotes a user to regular role", async () => {
		const demoted = { ...mockAdminUser, role: "user" };
		vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ data: demoted }), { status: 200 }));

		const { Wrapper } = createQueryWrapper();
		const { result } = renderHook(() => useDemoteUser(), { wrapper: Wrapper });

		await act(async () => {
			const data = await result.current.mutateAsync({ userId: "01ABC" });
			expect(data.role).toBe("user");
		});
	});
});

describe("useDeleteUser", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it("deletes a user (204 response)", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));

		const { Wrapper } = createQueryWrapper();
		const { result } = renderHook(() => useDeleteUser(), { wrapper: Wrapper });

		await act(async () => {
			await result.current.mutateAsync({ userId: "01ABC" });
		});

		await waitFor(() => {
			expect(result.current.isSuccess).toBe(true);
		});
	});

	it("invalidates admin users cache on success", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));

		const { Wrapper, queryClient } = createQueryWrapper();
		const { result } = renderHook(() => useDeleteUser(), { wrapper: Wrapper });
		const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

		await act(async () => {
			await result.current.mutateAsync({ userId: "01ABC" });
		});

		expect(invalidateSpy).toHaveBeenCalled();
	});
});
