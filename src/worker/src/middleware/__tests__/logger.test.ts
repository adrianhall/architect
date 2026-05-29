import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loggerMiddleware } from "../logger";

describe("Logger middleware", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it("logs structured JSON with required fields", async () => {
		const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

		const app = new Hono();
		app.use(loggerMiddleware);
		app.get("/test", (c) => c.json({ ok: true }));

		await app.fetch(new Request("http://localhost/test"));

		expect(consoleSpy).toHaveBeenCalledOnce();

		const logLine = consoleSpy.mock.calls[0][0] as string;
		const entry = JSON.parse(logLine) as Record<string, unknown>;

		expect(entry).toHaveProperty("timestamp");
		expect(entry).toHaveProperty("request_id");
		expect(entry.method).toBe("GET");
		expect(entry.path).toBe("/test");
		expect(entry.status).toBe(200);
		expect(typeof entry.duration_ms).toBe("number");
		expect(entry.duration_ms).toBeGreaterThanOrEqual(0);
	});

	it("includes user_email when authenticated user is on context", async () => {
		const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

		const app = new Hono<{ Variables: { userEmail: string } }>();
		app.use(loggerMiddleware);
		// Simulate auth middleware setting userEmail
		app.use(async (c, next) => {
			c.set("userEmail", "bob@example.com");
			await next();
		});
		app.get("/test", (c) => c.json({ ok: true }));

		await app.fetch(new Request("http://localhost/test"));

		const entry = JSON.parse(consoleSpy.mock.calls[0][0] as string) as Record<string, unknown>;
		expect(entry.user_email).toBe("bob@example.com");
	});

	it("sets requestId on context", async () => {
		vi.spyOn(console, "log").mockImplementation(() => {});

		let capturedId: string | undefined;

		const app = new Hono<{ Variables: { requestId: string } }>();
		app.use(loggerMiddleware);
		app.get("/test", (c) => {
			capturedId = c.get("requestId");
			return c.json({ ok: true });
		});

		await app.fetch(new Request("http://localhost/test"));

		expect(capturedId).toBeDefined();
		// UUID v4 format
		expect(capturedId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
	});
});
