import { describe, expect, it } from "vitest";
import { ErrorCode } from "../errors";
import { error, success } from "../response";

describe("Response helpers", () => {
	it("success() wraps data in { data } envelope", () => {
		const result = success({ id: "123", name: "test" });
		expect(result).toEqual({ data: { id: "123", name: "test" } });
	});

	it("error() builds standard error body without details", () => {
		const result = error(ErrorCode.NOT_FOUND, "Diagram not found");
		expect(result).toEqual({
			error: { code: "NOT_FOUND", message: "Diagram not found" },
		});
	});

	it("error() includes details when provided", () => {
		const result = error(ErrorCode.VALIDATION_ERROR, "Invalid input", {
			field: "title",
		});
		expect(result).toEqual({
			error: {
				code: "VALIDATION_ERROR",
				message: "Invalid input",
				details: { field: "title" },
			},
		});
	});

	it("error() excludes details key when undefined", () => {
		const result = error(ErrorCode.INTERNAL_ERROR, "Something broke");
		expect(Object.keys(result.error)).toEqual(["code", "message"]);
	});
});
