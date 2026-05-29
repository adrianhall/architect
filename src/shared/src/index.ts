/**
 * Shared type re-exports for the @architect/shared package.
 *
 * This barrel file aggregates all shared type modules so both the worker and
 * frontend packages can import from a single entry point (`@architect/shared`).
 * Each sub-module will be populated with concrete types in subsequent issues.
 */

export * from "./api.js";
export * from "./catalog.js";
export * from "./diagram.js";
export * from "./user.js";
