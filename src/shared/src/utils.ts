/**
 * General-purpose utility functions shared between the worker and frontend
 * packages.
 *
 * Functions here must have no external dependencies so they remain usable in
 * any execution environment (Cloudflare Workers runtime, jsdom, Node.js).
 */

/**
 * Returns `value` when it is neither `null` nor `undefined`; otherwise returns
 * `defaultValue`.
 *
 * This is a named, testable wrapper around the `??` (nullish coalescing)
 * operator. Prefer it over bare `??` in any situation where the default branch
 * is defensive—i.e. the fallback is required for correctness but is never
 * expected to be reached during normal operation. Consolidating all such
 * guards here means:
 *
 * - The defensive branch is exercised in a single unit-test rather than
 *   scattered across the codebase, keeping per-file v8 branch coverage clean.
 * - Call sites communicate intent clearly: the word "default" signals that
 *   the fallback is a safety net, not normal control flow.
 *
 * Use plain `??` when the default *is* part of normal control flow (e.g.
 * `user.name ?? user.email` falls back to email when a display name is absent;
 * that default is genuinely reachable and should be tested at the call site).
 *
 * @param value - The value to test. Accepts `T`, `null`, or `undefined`.
 * @param defaultValue - Returned when `value` is `null` or `undefined`.
 * @returns `value` if it is non-nullish, otherwise `defaultValue`.
 *
 * @example
 * ```ts
 * // Map lookup whose key is guaranteed by a preceding .has() filter —
 * // the [] fallback is unreachable in practice.
 * const items = getValueOrDefault(myMap.get(key), []);
 *
 * // Route parameter guaranteed by the router — "" fallback unreachable.
 * const id = getValueOrDefault(routeParam, "");
 *
 * // ELK child coordinates always populated after a successful layout —
 * // 0 fallback unreachable in practice.
 * const x = getValueOrDefault(child.x, 0);
 * ```
 */
export function getValueOrDefault<T>(value: T | null | undefined, defaultValue: T): T {
	return value ?? defaultValue;
}
