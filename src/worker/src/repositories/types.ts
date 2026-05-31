import type { DrizzleD1Database } from "drizzle-orm/d1";

/**
 * Concrete Drizzle database type shared by all repository modules.
 *
 * Matches the type returned by `drizzle(d1)` when called without a schema
 * argument, which is the pattern used by all route handlers in this project.
 * Centralised here so every repository imports from a single source rather
 * than repeating the type alias.
 */
export type Db = DrizzleD1Database<Record<string, never>>;

/**
 * Re-export {@link RepositoryError} from `lib/errors` so that consumers who
 * import through the `repositories` barrel (`../../repositories`) continue to
 * work without any import-path changes.
 *
 * The class is defined in `lib/errors` because it belongs alongside the other
 * error-handling utilities (`ErrorCode`, `convertErrorOrThrow`) and because
 * placing it there keeps the dependency direction clean: `repositories` →
 * `lib/errors`, never the other way around.
 */
export { RepositoryError } from "../lib/errors";
