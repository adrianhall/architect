# Diagram API: CRUD, duplicate, rename, concurrency + tests

## Summary

Implements the full diagram REST API as a single Hono route file at `src/worker/src/routes/diagrams.ts`, covering create, list, get, full update (with optimistic concurrency), partial update (rename), delete, and duplicate. All endpoints require authentication and enforce ownership checks. The route file is mounted in `src/worker/src/index.ts`. Comprehensive Vitest integration tests validate every endpoint, including concurrency conflict detection, ownership isolation, input validation, and edge cases.

## Relevant Skills

- `cloudflare`
- `workers-best-practices`
- `api-design-principles`
- `typescript-advanced-types`

## Requirements Coverage

- [F5-US1](../REQUIREMENTS.md): Dashboard showing user's diagrams sorted by recency - the `GET /api/diagrams` endpoint returns the user's diagrams sorted by `updated_at` desc.
- [F5-US2](../REQUIREMENTS.md): Create a new blank diagram - the `POST /api/diagrams` endpoint creates a blank diagram with default empty graph data.
- [F5-US3](../REQUIREMENTS.md): Duplicate any diagram with one click - the `POST /api/diagrams/:id/duplicate` endpoint clones a diagram with title `<original> (Copy)`.
- [F5-US4](../REQUIREMENTS.md): Delete a diagram - the `DELETE /api/diagrams/:id` endpoint removes a diagram.
- [F5-US5](../REQUIREMENTS.md): Rename a diagram inline - the `PATCH /api/diagrams/:id` endpoint updates only the title.
- [F4-US10](../REQUIREMENTS.md): Optimistic concurrency - the `PUT /api/diagrams/:id` endpoint checks `version` and returns 409 on conflict, supporting the "another session saved changes" UX.

## Acceptance Criteria

- [ ] `POST /api/diagrams` creates a diagram with a ULID id, default graph_data `{ nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } }`, and version 1.
- [ ] `POST /api/diagrams` returns 201 with the new diagram wrapped in `{ data: ... }`.
- [ ] `POST /api/diagrams` returns 400 when title is missing, empty, or longer than 80 characters.
- [ ] `GET /api/diagrams` returns only diagrams belonging to the authenticated user, sorted by `updated_at` descending.
- [ ] `GET /api/diagrams` returns `{ data: [...] }` envelope.
- [ ] `GET /api/diagrams/:id` returns the diagram if owned by the authenticated user.
- [ ] `GET /api/diagrams/:id` returns 404 if the diagram does not exist or is owned by another user.
- [ ] `PUT /api/diagrams/:id` updates title, graph_data, increments version, and updates `updated_at` when the request `version` matches the DB version.
- [ ] `PUT /api/diagrams/:id` returns 409 with error code `CONFLICT` when the request `version` does not match the DB version.
- [ ] `PUT /api/diagrams/:id` returns 400 for invalid graph_data (missing nodes/edges arrays).
- [ ] `PATCH /api/diagrams/:id` updates only the title and `updated_at`, does not change version.
- [ ] `PATCH /api/diagrams/:id` returns 400 for invalid title.
- [ ] `DELETE /api/diagrams/:id` returns 204 No Content on success.
- [ ] `DELETE /api/diagrams/:id` returns 404 if the diagram does not exist or is owned by another user.
- [ ] `POST /api/diagrams/:id/duplicate` creates a new diagram with a new ULID id, title `<original> (Copy)`, version 1, same graph_data, and returns 201.
- [ ] `POST /api/diagrams/:id/duplicate` returns 404 if the source diagram is not found or not owned.
- [ ] All endpoints return 401 for unauthenticated requests.
- [ ] All endpoints enforce ownership - user A cannot read, update, or delete user B's diagrams.
- [ ] `npm run build` builds all artifacts.
- [ ] `npm run check` passes.
- [ ] `npm run test` passes.
- [ ] `npm run test:coverage` passes with > 90% coverage for new and changed files.
- [ ] `npm start` builds and starts the service without errors.

## Technical Approach

### 1. Create the Route File

Create `src/worker/src/routes/diagrams.ts` that exports a Hono router. Import the Drizzle schema, ULID generation, and response helpers.

```typescript
// src/worker/src/routes/diagrams.ts
import { Hono } from "hono";
import { ulid } from "ulid";
// Import Drizzle schema, DB helpers, response envelope helpers, etc.
```

Use `new Hono()` and define all routes on it. The router will be mounted in `index.ts` under the `/api/diagrams` prefix.

### 2. ULID Generation

Install the `ulid` package (or `ulidx`) in the worker workspace:

```bash
npm install ulid --workspace=src/worker
```

Use `ulid()` to generate IDs for new diagrams. ULIDs are lexicographically sortable and encode creation time.

### 3. Endpoint Implementations

#### POST /api/diagrams (Create)

1. Parse request body, extract `title`.
2. Validate: `title` is a string, 1-80 chars. Return 400 with descriptive error if invalid.
3. Get `user_id` from the auth context (set by auth middleware from ISSUE-04/05).
4. Generate a new ULID for the diagram id.
5. Set default `graph_data`: `JSON.stringify({ nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } })`.
6. Set `version = 1`, `created_at` and `updated_at` to `Date.now()`.
7. Insert into diagrams table using Drizzle.
8. Return 201 with `{ data: <diagram> }`. When returning, parse `graph_data` from JSON string to object.

#### GET /api/diagrams (List)

1. Get `user_id` from auth context.
2. Query diagrams where `user_id` matches, ordered by `updated_at DESC`.
3. Map results to parse `graph_data` from JSON string to object for each diagram.
4. Return `{ data: [...] }`.

#### GET /api/diagrams/:id (Get Single)

1. Get `user_id` from auth context and `id` from route params.
2. Query diagram by `id` AND `user_id`. This ensures ownership check and 404 in one query.
3. If not found, return 404 with error code `NOT_FOUND`.
4. Parse `graph_data` and return `{ data: <diagram> }`.

#### PUT /api/diagrams/:id (Full Update)

1. Get `user_id` from auth context, `id` from route params.
2. Parse body: `{ title, graph_data, version }`.
3. Validate `title` (1-80 chars), `graph_data` (must have `nodes` array and `edges` array), `version` (integer).
4. Fetch current diagram by `id` AND `user_id`. Return 404 if not found.
5. Compare `version` from request with DB `version`. If they differ, return 409 with:

   ```json
   { "error": { "code": "CONFLICT", "message": "Diagram has been modified by another session. Please reload." } }
   ```

6. Update the diagram: set `title`, `graph_data` (stringified), `version = current_version + 1`, `updated_at = Date.now()`.
7. Return `{ data: <updated diagram> }` with parsed `graph_data`.

**Implementation note:** Use a single Drizzle `update().where(and(eq(id), eq(user_id), eq(version)))` to make the read-check-write atomic within the D1 transaction boundary. If `rowsAffected === 0`, re-fetch the diagram to determine whether it was a 404 (not found/not owned) or a 409 (version mismatch).

#### PATCH /api/diagrams/:id (Rename)

1. Get `user_id` from auth context, `id` from route params.
2. Parse body: `{ title }`.
3. Validate `title` (1-80 chars). Return 400 if invalid.
4. Update diagram where `id` AND `user_id` match: set `title`, `updated_at = Date.now()`. Do NOT change `version`.
5. If no rows affected, return 404.
6. Re-fetch and return `{ data: <updated diagram> }`.

#### DELETE /api/diagrams/:id

1. Get `user_id` from auth context, `id` from route params.
2. Delete diagram where `id` AND `user_id` match.
3. If no rows affected, return 404.
4. Return 204 (no body).

#### POST /api/diagrams/:id/duplicate

1. Get `user_id` from auth context, `id` from route params.
2. Fetch source diagram by `id` AND `user_id`. Return 404 if not found.
3. Create new diagram:
   - `id`: new ULID
   - `user_id`: same (authenticated user)
   - `title`: `${source.title} (Copy)` (truncate to 80 chars if needed)
   - `graph_data`: same as source
   - `version`: 1
   - `created_at`, `updated_at`: `Date.now()`
4. Insert and return 201 with `{ data: <new diagram> }`.

### 4. Validation Helper

Create a small validation helper (or add to `src/worker/src/lib/errors.ts`) for reuse:

```typescript
function validateTitle(title: unknown): string | null {
  if (typeof title !== "string" || title.length === 0 || title.length > 80) {
    return "Title must be a string between 1 and 80 characters";
  }
  return null; // valid
}

function validateGraphData(data: unknown): string | null {
  if (typeof data !== "object" || data === null) return "graph_data must be an object";
  if (!Array.isArray((data as any).nodes)) return "graph_data.nodes must be an array";
  if (!Array.isArray((data as any).edges)) return "graph_data.edges must be an array";
  return null; // valid
}
```

### 5. Response Envelope

Use the response helpers established in ISSUE-04/05 (from `src/worker/src/lib/response.ts`):

```typescript
// Success responses
function jsonData<T>(c: Context, data: T, status?: number): Response
// Error responses
function jsonError(c: Context, code: string, message: string, status: number): Response
```

### 6. Serialization Helper

Create a helper to convert a DB diagram row to an API response object (parsing `graph_data` from string):

```typescript
function serializeDiagram(row: DiagramRow) {
  return {
    id: row.id,
    user_id: row.user_id,
    title: row.title,
    graph_data: JSON.parse(row.graph_data),
    version: row.version,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
```

### 7. Mount Routes in index.ts

In `src/worker/src/index.ts`, import the diagrams router and mount it:

```typescript
import diagrams from "./routes/diagrams";

// After auth middleware is applied
app.route("/api/diagrams", diagrams);
```

Ensure the diagrams routes are mounted after the auth middleware so all endpoints require authentication.

### 8. Shared Types

If not already defined by ISSUE-01/03, ensure `src/shared/src/diagram.ts` exports the `GraphData`, `DiagramNode`, and `DiagramEdge` types as specified in MVP_PLAN.md Section 8. The API response type for a diagram should also be defined:

```typescript
export interface DiagramResponse {
  id: string;
  user_id: string;
  title: string;
  graph_data: GraphData;
  version: number;
  created_at: number;
  updated_at: number;
}
```

## Testing

All tests go in `src/worker/src/test/diagrams.test.ts` (or a `__tests__/diagrams.test.ts` colocated file). Tests use `@cloudflare/vitest-pool-workers` for the Workers runtime environment and the test helpers from ISSUE-05 (e.g., `signDevJwt` for auth, test data factories for users).

### Test Setup

Each test file should:

1. Use the `env` from `cloudflare:test` to access D1.
2. Create a test user (and optionally a second user for isolation tests) via direct DB insertion.
3. Create a helper to make authenticated requests using the dev JWT signer.

### Unit / Integration Tests

1. **Create diagram returns 201 with ULID id**
   - POST `/api/diagrams` with `{ title: "My Diagram" }` and valid auth.
   - Assert status 201, response has `data.id` matching ULID pattern (`/^[0-9A-Z]{26}$/i`).
   - Assert `data.version === 1`, `data.graph_data` has empty nodes/edges and default viewport.

2. **Create diagram with missing title returns 400**
   - POST `/api/diagrams` with `{}`. Assert 400 with descriptive error.

3. **Create diagram with empty title returns 400**
   - POST `/api/diagrams` with `{ title: "" }`. Assert 400.

4. **Create diagram with title > 80 chars returns 400**
   - POST `/api/diagrams` with `{ title: "x".repeat(81) }`. Assert 400.

5. **List diagrams returns only current user's diagrams**
   - Create 2 diagrams for user A, 1 for user B.
   - GET `/api/diagrams` as user A. Assert `data.length === 2`.
   - GET `/api/diagrams` as user B. Assert `data.length === 1`.

6. **List diagrams sorted by updated_at descending**
   - Create 2 diagrams, update one to change its `updated_at`.
   - GET `/api/diagrams`. Assert first diagram has the later `updated_at`.

7. **Get diagram by id returns correct data**
   - Create a diagram, GET `/api/diagrams/:id`. Assert all fields match.

8. **Get diagram with wrong user returns 404**
   - Create a diagram as user A. GET `/api/diagrams/:id` as user B. Assert 404.

9. **Get non-existent diagram returns 404**
   - GET `/api/diagrams/nonexistent-id`. Assert 404.

10. **Update with correct version succeeds and increments version**
    - Create a diagram (version 1). PUT with `version: 1` and new title/graph_data.
    - Assert 200, `data.version === 2`, title and graph_data updated.

11. **Update with stale version returns 409 CONFLICT**
    - Create a diagram (version 1). PUT with `version: 0`.
    - Assert 409, error code is `CONFLICT`.

12. **Update with invalid graph_data returns 400**
    - PUT with `graph_data: { invalid: true }` (missing nodes/edges). Assert 400.

13. **Update non-owned diagram returns 404**
    - Create as user A. PUT as user B. Assert 404.

14. **Rename (PATCH) updates only title**
    - Create a diagram. PATCH with `{ title: "New Name" }`.
    - Assert 200, `data.title === "New Name"`, version unchanged.

15. **Rename with invalid title returns 400**
    - PATCH with `{ title: "" }`. Assert 400.

16. **Delete returns 204 and diagram is gone**
    - Create a diagram. DELETE `/api/diagrams/:id`. Assert 204.
    - GET `/api/diagrams/:id`. Assert 404.

17. **Delete non-owned diagram returns 404**
    - Create as user A. DELETE as user B. Assert 404.

18. **Duplicate creates copy with "(Copy)" suffix**
    - Create a diagram with title "Original" and some graph_data.
    - POST `/api/diagrams/:id/duplicate`.
    - Assert 201, `data.title === "Original (Copy)"`, `data.version === 1`.
    - Assert `data.id` is different from original, `data.graph_data` matches original.

19. **Duplicate non-owned diagram returns 404**
    - Create as user A. Duplicate as user B. Assert 404.

20. **Unauthenticated request returns 401**
    - Make requests without auth header to each endpoint. Assert 401 for all.

### Manual Tests

After deploying locally with `npm start`:

```bash
# Set auth token (adjust for your dev auth setup)
TOKEN="<dev-jwt-token>"
AUTH="Authorization: Bearer $TOKEN"

# Create a diagram
curl -s -X POST http://localhost:8787/api/diagrams \
  -H "Content-Type: application/json" \
  -H "$AUTH" \
  -d '{"title":"Test Diagram"}' | jq .

# List diagrams
curl -s http://localhost:8787/api/diagrams \
  -H "$AUTH" | jq .

# Get single diagram (replace <ID> with actual id)
curl -s http://localhost:8787/api/diagrams/<ID> \
  -H "$AUTH" | jq .

# Full update with version check
curl -s -X PUT http://localhost:8787/api/diagrams/<ID> \
  -H "Content-Type: application/json" \
  -H "$AUTH" \
  -d '{"title":"Updated","graph_data":{"nodes":[],"edges":[],"viewport":{"x":0,"y":0,"zoom":1}},"version":1}' | jq .

# Try stale version update (should 409)
curl -s -X PUT http://localhost:8787/api/diagrams/<ID> \
  -H "Content-Type: application/json" \
  -H "$AUTH" \
  -d '{"title":"Stale","graph_data":{"nodes":[],"edges":[]},"version":1}' | jq .

# Rename
curl -s -X PATCH http://localhost:8787/api/diagrams/<ID> \
  -H "Content-Type: application/json" \
  -H "$AUTH" \
  -d '{"title":"Renamed Diagram"}' | jq .

# Duplicate
curl -s -X POST http://localhost:8787/api/diagrams/<ID>/duplicate \
  -H "$AUTH" | jq .

# Delete
curl -s -X DELETE http://localhost:8787/api/diagrams/<ID> \
  -H "$AUTH" -w "\nHTTP Status: %{http_code}\n"
```
