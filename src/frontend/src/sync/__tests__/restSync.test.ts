import type { GraphData } from "@architect/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRestSync } from "../restSync";

/** Minimal GraphData fixture for all tests. */
const GRAPH_DATA: GraphData = {
	nodes: [],
	edges: [],
	viewport: { x: 0, y: 0, zoom: 1 },
};

describe("createRestSync", () => {
	beforeEach(() => {
		vi.stubGlobal("fetch", vi.fn());
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	// ── Successful save ────────────────────────────────────────────────────────

	describe("successful save (2xx)", () => {
		it("returns success=true with the new version number", async () => {
			vi.mocked(fetch).mockResolvedValueOnce(
				new Response(JSON.stringify({ data: { version: 2 } }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			);

			const sync = createRestSync();
			const result = await sync.save("diag-01", "My Diagram", GRAPH_DATA, 1);

			expect(result).toEqual({ success: true, version: 2 });
		});
	});

	// ── Conflict (409) ─────────────────────────────────────────────────────────

	describe("conflict response (409)", () => {
		it("returns success=false with conflict=true and serverVersion", async () => {
			vi.mocked(fetch).mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						error: {
							code: "CONFLICT",
							message: "Stale version",
							details: { serverVersion: 5 },
						},
					}),
					{ status: 409, headers: { "Content-Type": "application/json" } },
				),
			);

			const sync = createRestSync();
			const result = await sync.save("diag-01", "My Diagram", GRAPH_DATA, 4);

			expect(result).toMatchObject({
				success: false,
				conflict: true,
				serverVersion: 5,
			});
		});

		it("falls back to version+1 when details are missing from 409 body", async () => {
			vi.mocked(fetch).mockResolvedValueOnce(
				new Response(JSON.stringify({ error: { code: "CONFLICT" } }), {
					status: 409,
					headers: { "Content-Type": "application/json" },
				}),
			);

			const sync = createRestSync();
			const result = await sync.save("diag-01", "My Diagram", GRAPH_DATA, 3);

			expect(result).toMatchObject({ success: false, conflict: true, serverVersion: 4 });
		});
	});

	// ── Server error (5xx) ─────────────────────────────────────────────────────

	describe("server error response (non-409 HTTP error)", () => {
		it("returns success=false with the server error message", async () => {
			vi.mocked(fetch).mockResolvedValueOnce(
				new Response(JSON.stringify({ error: { message: "Internal server error" } }), {
					status: 500,
					headers: { "Content-Type": "application/json" },
				}),
			);

			const sync = createRestSync();
			const result = await sync.save("diag-01", "My Diagram", GRAPH_DATA, 1);

			expect(result).toMatchObject({
				success: false,
				error: "Internal server error",
			});
		});

		it("falls back to a generic message when error body is unparseable", async () => {
			vi.mocked(fetch).mockResolvedValueOnce(new Response("not json", { status: 503 }));

			const sync = createRestSync();
			const result = await sync.save("diag-01", "My Diagram", GRAPH_DATA, 1);

			expect(result).toMatchObject({
				success: false,
				error: "Save failed with status 503",
			});
		});
	});

	// ── Network error ──────────────────────────────────────────────────────────

	describe("network error (fetch throws)", () => {
		it("returns success=false with the Error message", async () => {
			vi.mocked(fetch).mockRejectedValueOnce(new TypeError("Failed to fetch"));

			const sync = createRestSync();
			const result = await sync.save("diag-01", "My Diagram", GRAPH_DATA, 1);

			expect(result).toMatchObject({
				success: false,
				error: "Failed to fetch",
			});
		});

		it("uses 'Network error' when a non-Error value is thrown", async () => {
			vi.mocked(fetch).mockRejectedValueOnce("not an error object");

			const sync = createRestSync();
			const result = await sync.save("diag-01", "My Diagram", GRAPH_DATA, 1);

			expect(result).toMatchObject({ success: false, error: "Network error" });
		});
	});

	// ── Request shape ──────────────────────────────────────────────────────────

	describe("request construction", () => {
		it("sends PUT to /api/diagrams/:id with correct body fields", async () => {
			vi.mocked(fetch).mockResolvedValueOnce(
				new Response(JSON.stringify({ data: { version: 2 } }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			);

			const sync = createRestSync();
			await sync.save("diag-42", "Architecture", GRAPH_DATA, 7);

			expect(fetch).toHaveBeenCalledOnce();
			const [url, opts] = vi.mocked(fetch).mock.calls[0];
			expect(url).toBe("/api/diagrams/diag-42");
			expect(opts?.method).toBe("PUT");
			expect(opts?.headers).toMatchObject({ "Content-Type": "application/json" });

			const body = JSON.parse(opts?.body as string);
			expect(body).toMatchObject({
				title: "Architecture",
				graph_data: GRAPH_DATA,
				version: 7,
			});
		});

		it("prepends the baseUrl when one is provided", async () => {
			vi.mocked(fetch).mockResolvedValueOnce(
				new Response(JSON.stringify({ data: { version: 1 } }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			);

			const sync = createRestSync("http://localhost:8787");
			await sync.save("diag-01", "Test", GRAPH_DATA, 1);

			const [url] = vi.mocked(fetch).mock.calls[0];
			expect(url).toBe("http://localhost:8787/api/diagrams/diag-01");
		});
	});

	// ── Mock DiagramSync abstraction ───────────────────────────────────────────

	describe("DiagramSync abstraction", () => {
		it("any DiagramSync implementation receives the correct arguments", async () => {
			const mockSave = vi.fn().mockResolvedValue({ success: true, version: 3 });
			const mockSync = { save: mockSave };

			await mockSync.save("diag-99", "Test Title", GRAPH_DATA, 2);

			expect(mockSave).toHaveBeenCalledWith("diag-99", "Test Title", GRAPH_DATA, 2);
		});
	});
});
