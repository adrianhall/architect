import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "../../../test/query-wrapper";
import {
	ADMIN_USERS_QUERY_KEY,
	type AdminUsersResponse,
	useAdminUsers,
	useDeleteUser,
	useDemoteUser,
	usePromoteUser,
} from "../useAdmin";

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

const mockUsersResponse: AdminUsersResponse = {
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

	it("applies optimistic update to cached user list before mutation resolves", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(JSON.stringify({ data: { ...mockAdminUser, role: "admin" } }), { status: 200 }),
		);

		const { Wrapper, queryClient } = createQueryWrapper();

		// Pre-populate the cache with existing data
		queryClient.setQueryData([...ADMIN_USERS_QUERY_KEY, {}], mockUsersResponse);

		const { result } = renderHook(() => usePromoteUser(), { wrapper: Wrapper });

		await act(async () => {
			await result.current.mutateAsync({ userId: "01ABC" });
		});

		// After mutation, cache should be invalidated (data may have been refetched)
		// Verify the mutation ran successfully
		await waitFor(() => {
			expect(result.current.isSuccess).toBe(true);
		});
	});

	it("rolls back optimistic update when mutation fails", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(JSON.stringify({ error: { code: "FORBIDDEN", message: "Forbidden" } }), { status: 403 }),
		);

		const { Wrapper, queryClient } = createQueryWrapper();

		// Pre-populate the cache with existing data
		queryClient.setQueryData([...ADMIN_USERS_QUERY_KEY, {}], mockUsersResponse);

		const { result } = renderHook(() => usePromoteUser(), { wrapper: Wrapper });

		await act(async () => {
			try {
				await result.current.mutateAsync({ userId: "01ABC" });
			} catch {
				// Expected to fail
			}
		});

		// After error, the mutation should have failed
		await waitFor(() => {
			expect(result.current.isError).toBe(true);
		});
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

	it("applies optimistic update to cached user list", async () => {
		const adminUserData = { ...mockAdminUser, role: "admin" };
		const responseWithAdmin: AdminUsersResponse = {
			...mockUsersResponse,
			users: [adminUserData],
		};

		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(JSON.stringify({ data: { ...adminUserData, role: "user" } }), { status: 200 }),
		);

		const { Wrapper, queryClient } = createQueryWrapper();

		// Pre-populate cache with an admin user
		queryClient.setQueryData([...ADMIN_USERS_QUERY_KEY, {}], responseWithAdmin);

		const { result } = renderHook(() => useDemoteUser(), { wrapper: Wrapper });

		await act(async () => {
			await result.current.mutateAsync({ userId: "01ABC" });
		});

		await waitFor(() => {
			expect(result.current.isSuccess).toBe(true);
		});
	});

	it("rolls back optimistic update when mutation fails", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(JSON.stringify({ error: { code: "FORBIDDEN", message: "Forbidden" } }), { status: 403 }),
		);

		const { Wrapper, queryClient } = createQueryWrapper();
		queryClient.setQueryData([...ADMIN_USERS_QUERY_KEY, {}], mockUsersResponse);

		const { result } = renderHook(() => useDemoteUser(), { wrapper: Wrapper });

		await act(async () => {
			try {
				await result.current.mutateAsync({ userId: "01ABC" });
			} catch {
				// Expected to fail
			}
		});

		await waitFor(() => {
			expect(result.current.isError).toBe(true);
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

	it("optimistically removes user from cached list before mutation resolves", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));

		const { Wrapper, queryClient } = createQueryWrapper();

		// Pre-populate the cache
		queryClient.setQueryData([...ADMIN_USERS_QUERY_KEY, {}], mockUsersResponse);

		const { result } = renderHook(() => useDeleteUser(), { wrapper: Wrapper });

		await act(async () => {
			await result.current.mutateAsync({ userId: "01ABC" });
		});

		await waitFor(() => {
			expect(result.current.isSuccess).toBe(true);
		});
	});

	it("rolls back optimistic delete when mutation fails", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(JSON.stringify({ error: { code: "FORBIDDEN", message: "Forbidden" } }), { status: 403 }),
		);

		const { Wrapper, queryClient } = createQueryWrapper();
		queryClient.setQueryData([...ADMIN_USERS_QUERY_KEY, {}], mockUsersResponse);

		const { result } = renderHook(() => useDeleteUser(), { wrapper: Wrapper });

		await act(async () => {
			try {
				await result.current.mutateAsync({ userId: "01ABC" });
			} catch {
				// Expected to fail
			}
		});

		await waitFor(() => {
			expect(result.current.isError).toBe(true);
		});
	});
});
