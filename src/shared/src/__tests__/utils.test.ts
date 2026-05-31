import { describe, expect, it } from "vitest";
import { getValueOrDefault, parseIntOrDefault } from "../utils.js";

describe("getValueOrDefault", () => {
	// ── non-nullish values pass through unchanged ────────────────────────────

	it("returns the value when it is a non-empty string", () => {
		expect(getValueOrDefault("hello", "default")).toBe("hello");
	});

	it("returns the value when it is the number 0 (falsy but non-nullish)", () => {
		expect(getValueOrDefault(0, 99)).toBe(0);
	});

	it("returns the value when it is false (falsy but non-nullish)", () => {
		expect(getValueOrDefault(false, true)).toBe(false);
	});

	it("returns the value when it is an empty string (falsy but non-nullish)", () => {
		expect(getValueOrDefault("", "fallback")).toBe("");
	});

	it("returns the value when it is a non-empty array", () => {
		const arr = [1, 2, 3];
		expect(getValueOrDefault(arr, [])).toBe(arr);
	});

	it("returns the value when it is an object", () => {
		const obj = { x: 1 };
		expect(getValueOrDefault(obj, { x: 0 })).toBe(obj);
	});

	// ── null triggers the default ────────────────────────────────────────────

	it("returns defaultValue when value is null", () => {
		expect(getValueOrDefault(null, "fallback")).toBe("fallback");
	});

	it("returns defaultValue number when value is null", () => {
		expect(getValueOrDefault(null, 42)).toBe(42);
	});

	it("returns defaultValue array when value is null", () => {
		const fallback: string[] = [];
		expect(getValueOrDefault(null, fallback)).toBe(fallback);
	});

	// ── undefined triggers the default ──────────────────────────────────────

	it("returns defaultValue when value is undefined", () => {
		expect(getValueOrDefault(undefined, "fallback")).toBe("fallback");
	});

	it("returns defaultValue number when value is undefined", () => {
		expect(getValueOrDefault(undefined, 0)).toBe(0);
	});

	it("returns defaultValue object when value is undefined", () => {
		const fallback = { y: 2 };
		expect(getValueOrDefault(undefined, fallback)).toBe(fallback);
	});

	// ── type variety ─────────────────────────────────────────────────────────

	it("works with number type: returns value when non-nullish", () => {
		expect(getValueOrDefault(7, 0)).toBe(7);
	});

	it("works with boolean type: returns defaultValue when null", () => {
		expect(getValueOrDefault<boolean>(null, true)).toBe(true);
	});

	it("works with Record type: returns defaultValue when undefined", () => {
		const def: Record<string, unknown> = { a: 1 };
		expect(getValueOrDefault(undefined, def)).toBe(def);
	});
});

describe("parseIntOrDefault", () => {
	// ── valid integers pass through unchanged ────────────────────────────────

	it("returns the value when it is a positive integer", () => {
		expect(parseIntOrDefault(42, 1)).toBe(42);
	});

	it("returns the value when it is zero (falsy but valid)", () => {
		expect(parseIntOrDefault(0, 99)).toBe(0);
	});

	it("returns the value when it is a negative integer", () => {
		expect(parseIntOrDefault(-5, 0)).toBe(-5);
	});

	it("returns the value when produced by a successful Number.parseInt", () => {
		expect(parseIntOrDefault(Number.parseInt("7", 10), 1)).toBe(7);
	});

	// ── NaN triggers the default ─────────────────────────────────────────────

	it("returns defaultValue when value is NaN (non-numeric string)", () => {
		expect(parseIntOrDefault(Number.parseInt("abc", 10), 1)).toBe(1);
	});

	it("returns defaultValue when value is NaN (empty string)", () => {
		expect(parseIntOrDefault(Number.parseInt("", 10), 20)).toBe(20);
	});

	it("returns defaultValue when Number.isNaN(value) is true", () => {
		expect(parseIntOrDefault(Number.NaN, 99)).toBe(99);
	});
});
