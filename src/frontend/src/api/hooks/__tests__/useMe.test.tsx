import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "../../../test/query-wrapper";
import { useMe } from "../useMe";

describe("useMe", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it("fetches and returns user data", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(
				JSON.stringify({
					data: {
						id: "01ABC",
						email: "alice@example.com",
						name: "alice",
						avatar_url: null,
						role: "user",
						created_at: 1000,
						updated_at: 1000,
					},
				}),
				{ status: 200 },
			),
		);

		const { Wrapper } = createQueryWrapper();
		const { result } = renderHook(() => useMe(), { wrapper: Wrapper });

		await waitFor(() => {
			expect(result.current.isSuccess).toBe(true);
		});

		expect(result.current.data?.email).toBe("alice@example.com");
		expect(result.current.data?.role).toBe("user");
	});

	it("starts in loading state", () => {
		vi.spyOn(globalThis, "fetch").mockReturnValue(new Promise(() => {}));

		const { Wrapper } = createQueryWrapper();
		const { result } = renderHook(() => useMe(), { wrapper: Wrapper });

		expect(result.current.isLoading).toBe(true);
		expect(result.current.data).toBeUndefined();
	});

	it("returns error state on 401 response", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(JSON.stringify({ error: { code: "UNAUTHORIZED", message: "Not authenticated" } }), { status: 401 }),
		);

		const { Wrapper } = createQueryWrapper();
		const { result } = renderHook(() => useMe(), { wrapper: Wrapper });

		await waitFor(() => {
			expect(result.current.isError).toBe(true);
		});

		expect(result.current.data).toBeUndefined();
	});

	it("does not retry on failure", async () => {
		// With retry: false, fetch should be called exactly once even on error.
		const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(JSON.stringify({ error: { code: "UNAUTHORIZED", message: "Not authenticated" } }), {
				status: 401,
			}),
		);

		const { Wrapper } = createQueryWrapper();
		const { result } = renderHook(() => useMe(), { wrapper: Wrapper });

		await waitFor(() => {
			expect(result.current.isError).toBe(true);
		});

		expect(fetchSpy).toHaveBeenCalledTimes(1);
	});
});
