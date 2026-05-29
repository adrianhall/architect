import { describe, expect, it } from "vitest";
import type { ApiErrorCode, ApiErrorResponse, ApiResponse, ApiSuccessResponse } from "./api.js";

describe("shared API types", () => {
	it("should allow constructing a success response", () => {
		const response: ApiSuccessResponse<{ id: string }> = {
			data: { id: "123" },
		};

		expect(response.data.id).toBe("123");
	});

	it("should allow constructing an error response", () => {
		const response: ApiErrorResponse = {
			error: {
				code: "NOT_FOUND",
				message: "Diagram not found",
			},
		};

		expect(response.error.code).toBe("NOT_FOUND");
	});

	it("should support all error codes", () => {
		const codes: ApiErrorCode[] = [
			"BAD_REQUEST",
			"UNAUTHORIZED",
			"FORBIDDEN",
			"NOT_FOUND",
			"CONFLICT",
			"INTERNAL_ERROR",
		];
		expect(codes).toHaveLength(6);
	});

	it("should allow details on error responses", () => {
		const response: ApiErrorResponse = {
			error: {
				code: "BAD_REQUEST",
				message: "Validation failed",
				details: { field: "title", reason: "too long" },
			},
		};

		expect(response.error.details).toBeDefined();
	});

	it("should allow discriminating ApiResponse by key presence", () => {
		const success: ApiResponse<string> = { data: "hello" };
		const error: ApiResponse<string> = {
			error: { code: "INTERNAL_ERROR", message: "Something went wrong" },
		};

		expect("data" in success).toBe(true);
		expect("error" in error).toBe(true);
	});
});
