/**
 * Public API of the `repositories` package.
 *
 * Re-exports shared infrastructure (`RepositoryError`, `Db`) from `types` and
 * all domain-specific repository functions and types from each repository
 * module. Consumers can import everything from this single entry point:
 *
 * ```ts
 * import {
 *   RepositoryError,
 *   resolveActor,
 *   listUsers,
 *   type ListParams,
 * } from "../../repositories";
 * ```
 *
 * When adding a new repository module, add a corresponding `export *` line
 * below so its exports are available through the barrel without requiring
 * callers to know the internal file layout.
 */

export * from "./types";
export * from "./users.repository";
