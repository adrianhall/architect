import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiClient } from "../client";

describe("apiClient", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it("prepends /api/ to the path", async () => {
		const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(JSON.stringify({ data: { version: "1.0.0" } }), {
				status: 200,
			}),
		);

		await apiClient("version");

		expect(fetchSpy).toHaveBeenCalledWith("/api/version", expect.any(Object));
	});

	it("normalizes leading slashes in path", async () => {
		const fetchSpy = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(new Response(JSON.stringify({ data: {} }), { status: 200 }));

		await apiClient("/version");

		expect(fetchSpy).toHaveBeenCalledWith("/api/version", expect.any(Object));
	});

	it("returns the data field from the success envelope", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(JSON.stringify({ data: { id: "123", title: "My Diagram" } }), {
				status: 200,
			}),
		);

		const result = await apiClient<{ id: string; title: string }>("diagrams/123");
		expect(result).toEqual({ id: "123", title: "My Diagram" });
	});

	it("throws ApiError for non-OK responses", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(JSON.stringify({ error: { code: "NOT_FOUND", message: "Diagram not found" } }), {
				status: 404,
			}),
		);

		await expect(apiClient("diagrams/missing")).rejects.toBeInstanceOf(ApiError);
	});

	it("populates ApiError with code, message, and status", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(JSON.stringify({ error: { code: "NOT_FOUND", message: "Diagram not found" } }), {
				status: 404,
			}),
		);

		try {
			await apiClient("diagrams/missing");
		} catch (err) {
			expect(err).toBeInstanceOf(ApiError);
			const apiErr = err as ApiError;
			expect(apiErr.code).toBe("NOT_FOUND");
			expect(apiErr.message).toBe("Diagram not found");
			expect(apiErr.status).toBe(404);
		}
	});

	it("falls back to INTERNAL_ERROR code when error envelope is missing", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({}), { status: 500 }));

		try {
			await apiClient("broken");
		} catch (err) {
			expect(err).toBeInstanceOf(ApiError);
			const apiErr = err as ApiError;
			expect(apiErr.code).toBe("INTERNAL_ERROR");
			expect(apiErr.status).toBe(500);
		}
	});

	it("sets Content-Type: application/json for POST requests with body", async () => {
		const fetchSpy = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(new Response(JSON.stringify({ data: {} }), { status: 201 }));

		await apiClient("diagrams", {
			method: "POST",
			body: JSON.stringify({ title: "New" }),
		});

		const calledHeaders = fetchSpy.mock.calls[0][1]?.headers;
		expect(calledHeaders).toBeDefined();
		const headers = new Headers(calledHeaders as HeadersInit);
		expect(headers.get("Content-Type")).toBe("application/json");
	});

	it("sets Content-Type: application/json for PUT requests with body", async () => {
		const fetchSpy = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(new Response(JSON.stringify({ data: {} }), { status: 200 }));

		await apiClient("diagrams/123", {
			method: "PUT",
			body: JSON.stringify({ title: "Updated" }),
		});

		const calledHeaders = fetchSpy.mock.calls[0][1]?.headers;
		const headers = new Headers(calledHeaders as HeadersInit);
		expect(headers.get("Content-Type")).toBe("application/json");
	});

	it("sets Content-Type: application/json for PATCH requests with body", async () => {
		const fetchSpy = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(new Response(JSON.stringify({ data: {} }), { status: 200 }));

		await apiClient("diagrams/123", {
			method: "PATCH",
			body: JSON.stringify({ title: "Renamed" }),
		});

		const calledHeaders = fetchSpy.mock.calls[0][1]?.headers;
		const headers = new Headers(calledHeaders as HeadersInit);
		expect(headers.get("Content-Type")).toBe("application/json");
	});

	it("does not override Content-Type when caller already set it", async () => {
		const fetchSpy = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(new Response(JSON.stringify({ data: {} }), { status: 200 }));

		await apiClient("diagrams", {
			method: "POST",
			body: "custom",
			headers: { "Content-Type": "text/plain" },
		});

		const calledHeaders = fetchSpy.mock.calls[0][1]?.headers;
		const headers = new Headers(calledHeaders as HeadersInit);
		expect(headers.get("Content-Type")).toBe("text/plain");
	});

	it("does not set Content-Type for GET requests", async () => {
		const fetchSpy = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(new Response(JSON.stringify({ data: {} }), { status: 200 }));

		await apiClient("version");

		const calledHeaders = fetchSpy.mock.calls[0][1]?.headers;
		const headers = new Headers(calledHeaders as HeadersInit);
		expect(headers.get("Content-Type")).toBeNull();
	});

	it("handles 204 No Content responses by returning undefined", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));

		const result = await apiClient("diagrams/123", { method: "DELETE" });
		expect(result).toBeUndefined();
	});
});
