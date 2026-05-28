# Admin API + structured audit logging + tests

## Summary

Implements admin-only user management endpoints at `src/worker/src/routes/admin/users.ts`, guarded by an admin middleware. Provides a paginated, sortable, searchable user list (with per-user diagram counts), role promotion/demotion, and user deletion with cascade. Every admin mutation emits a structured JSON audit log entry via `console.log`, which flows into Cloudflare Logs automatically. The admin route file is mounted in `src/worker/src/index.ts` behind both the auth middleware and an admin role guard.

## Relevant Skills

- `cloudflare`
- `workers-best-practices`
- `api-design-principles`

## Requirements Coverage

- [F2-US3](../REQUIREMENTS.md): Paginated, sortable, searchable list of users - the `GET /api/admin/users` endpoint returns paginated results with sorting and search filtering.
- [F2-US4](../REQUIREMENTS.md): Promote, demote, or delete a user; cannot demote or delete own account - `PATCH /api/admin/users/:id/role` and `DELETE /api/admin/users/:id` with self-action prevention.
- [F2-US5](../REQUIREMENTS.md): Each user's diagram count in the admin list - the user list response includes `diagram_count` per user.
- [F2-US9](../REQUIREMENTS.md): Audit log recording actor, target, action, and timestamp for every admin mutation - structured JSON emitted to `console.log`.

## Acceptance Criteria

- [ ] `GET /api/admin/users` returns a paginated list of users with `diagram_count` per user.
- [ ] `GET /api/admin/users` supports `page`, `limit`, `sort`, `order`, and `search` query parameters.
- [ ] `GET /api/admin/users` pagination metadata includes `page`, `limit`, `total`, and `totalPages`.
- [ ] `GET /api/admin/users` search filters users by email or name (case-insensitive LIKE match).
- [ ] `GET /api/admin/users` defaults: page=1, limit=20, sort=created_at, order=desc.
- [ ] `PATCH /api/admin/users/:id/role` changes a user's role to `admin` or `user`.
- [ ] `PATCH /api/admin/users/:id/role` returns 400 with code `SELF_ACTION_FORBIDDEN` when targeting own user id.
- [ ] `PATCH /api/admin/users/:id/role` returns 400 for invalid role values (not `admin` or `user`).
- [ ] `PATCH /api/admin/users/:id/role` returns 404 when the target user does not exist.
- [ ] `DELETE /api/admin/users/:id` deletes the user and all their diagrams (cascade).
- [ ] `DELETE /api/admin/users/:id` returns 204 on success.
- [ ] `DELETE /api/admin/users/:id` returns 400 with code `SELF_ACTION_FORBIDDEN` when targeting own user id.
- [ ] `DELETE /api/admin/users/:id` returns 404 when the target user does not exist.
- [ ] All admin endpoints return 403 for non-admin users.
- [ ] All admin endpoints return 401 for unauthenticated requests.
- [ ] Every admin mutation emits a structured JSON log with `event`, `action`, `actor_id`, `actor_email`, `target_id`, `target_email`, and `timestamp`.
- [ ] `npm run build` builds all artifacts.
- [ ] `npm run check` passes.
- [ ] `npm run test` passes.
- [ ] `npm run test:coverage` passes with > 90% coverage for new and changed files.
- [ ] `npm start` builds and starts the service without errors.

## Technical Approach

### 1. Admin Middleware

If not already created by ISSUE-04/05, create `src/worker/src/middleware/admin.ts` that exports a Hono middleware:

```typescript
import { createMiddleware } from "hono/factory";

export const requireAdmin = createMiddleware(async (c, next) => {
  const user = c.get("user"); // Set by auth middleware
  if (!user || user.role !== "admin") {
    return c.json(
      { error: { code: "FORBIDDEN", message: "Admin access required" } },
      403
    );
  }
  await next();
});
```

The middleware reads the `user` object from the Hono context (set by the auth middleware in ISSUE-04) and checks that `role === "admin"`. If not, it returns 403.

### 2. Create the Admin Users Route File

Create `src/worker/src/routes/admin/users.ts` that exports a Hono router:

```typescript
import { Hono } from "hono";

const app = new Hono();

// GET /  → list users (paginated, sorted, searchable)
// PATCH /:id/role → change role
// DELETE /:id → delete user + cascade diagrams

export default app;
```

### 3. GET /api/admin/users (Paginated User List)

**Query parameters:**

- `page` (integer, default: 1, min: 1)
- `limit` (integer, default: 20, min: 1, max: 100)
- `sort` (string, one of: `email`, `name`, `role`, `created_at`; default: `created_at`)
- `order` (string, one of: `asc`, `desc`; default: `desc`)
- `search` (string, optional)

**Implementation:**

1. Parse and validate query parameters. Clamp `limit` to 1-100, `page` to >= 1.
2. Build a Drizzle query on the `users` table.
3. If `search` is provided, add a WHERE clause: `(email LIKE '%search%' OR name LIKE '%search%')`. Use Drizzle's `like` or `sql` operator for case-insensitive matching.
4. Count total matching rows for pagination metadata.
5. Apply ORDER BY using the `sort` and `order` params. Map the sort field name to the actual Drizzle column reference.
6. Apply LIMIT and OFFSET (`offset = (page - 1) * limit`).
7. For each user in the result, run a subquery or join to get `diagram_count` (count of diagrams where `diagrams.user_id = users.id`).

**Efficient diagram count approach:** Use a single query with a LEFT JOIN and GROUP BY, or use a correlated subquery in the SELECT:

```sql
SELECT users.*, 
  (SELECT COUNT(*) FROM diagrams WHERE diagrams.user_id = users.id) as diagram_count
FROM users
WHERE ...
ORDER BY ...
LIMIT ? OFFSET ?
```

In Drizzle, this can be done with `sql<number>` for the subquery:

```typescript
import { sql } from "drizzle-orm";

const diagramCount = sql<number>`(SELECT COUNT(*) FROM diagrams WHERE diagrams.user_id = ${users.id})`.as("diagram_count");
```

**Response format:**

```json
{
  "data": {
    "users": [
      {
        "id": "...",
        "email": "...",
        "name": "...",
        "avatar_url": "...",
        "role": "user",
        "diagram_count": 5,
        "created_at": 1234567890,
        "updated_at": 1234567890
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 42,
      "totalPages": 3
    }
  }
}
```

### 4. PATCH /api/admin/users/:id/role

1. Get the authenticated user from context (`actor`).
2. Get `:id` from route params.
3. **Self-action check:** If `actor.id === params.id`, return 400:

   ```json
   { "error": { "code": "SELF_ACTION_FORBIDDEN", "message": "Cannot change your own role" } }
   ```

4. Parse body: `{ role }`. Validate that `role` is either `"admin"` or `"user"`. Return 400 for invalid values.
5. Fetch the target user by id. Return 404 if not found.
6. Determine the action for audit: if changing to `admin`, action is `promote`; if changing to `user`, action is `demote`.
7. Update the user's `role` and `updated_at`.
8. **Emit audit log:**

   ```typescript
   console.log(JSON.stringify({
     event: "admin_action",
     action: "promote", // or "demote"
     actor_id: actor.id,
     actor_email: actor.email,
     target_id: targetUser.id,
     target_email: targetUser.email,
     timestamp: new Date().toISOString(),
   }));
   ```

9. Return the updated user in `{ data: <user> }`.

### 5. DELETE /api/admin/users/:id

1. Get the authenticated user from context (`actor`).
2. Get `:id` from route params.
3. **Self-action check:** If `actor.id === params.id`, return 400:

   ```json
   { "error": { "code": "SELF_ACTION_FORBIDDEN", "message": "Cannot delete your own account" } }
   ```

4. Fetch the target user by id. Return 404 if not found.
5. **Cascade delete:** First delete all diagrams belonging to the target user, then delete the user:

   ```typescript
   await db.delete(diagrams).where(eq(diagrams.user_id, targetUser.id));
   await db.delete(users).where(eq(users.id, targetUser.id));
   ```

   D1 supports foreign keys, but since we may not have ON DELETE CASCADE defined, explicitly delete diagrams first for safety.
6. **Emit audit log:**

   ```typescript
   console.log(JSON.stringify({
     event: "admin_action",
     action: "delete_user",
     actor_id: actor.id,
     actor_email: actor.email,
     target_id: targetUser.id,
     target_email: targetUser.email,
     timestamp: new Date().toISOString(),
   }));
   ```

7. Return 204 No Content.

### 6. Mount Admin Routes in index.ts

In `src/worker/src/index.ts`:

```typescript
import adminUsers from "./routes/admin/users";
import { requireAdmin } from "./middleware/admin";

// Mount after auth middleware, before the asset catch-all
const adminRoutes = new Hono();
adminRoutes.use("*", requireAdmin);
adminRoutes.route("/users", adminUsers);
app.route("/api/admin", adminRoutes);
```

This ensures all `/api/admin/*` routes pass through both auth (already applied globally for `/api/*`) and the admin guard.

### 7. Audit Log Format

All admin mutations emit structured JSON via `console.log`. The format is:

```json
{
  "event": "admin_action",
  "action": "promote" | "demote" | "delete_user",
  "actor_id": "<ULID>",
  "actor_email": "<email>",
  "target_id": "<ULID>",
  "target_email": "<email>",
  "timestamp": "<ISO 8601>"
}
```

This follows the pattern described in MVP_PLAN.md Section 11 ("Audit logging is console-only"). Cloudflare Workers automatically forwards `console.log` output to Cloudflare Logs (formerly Logpush/Tail Workers).

## Testing

All tests go in `src/worker/src/test/admin-users.test.ts`. Tests use `@cloudflare/vitest-pool-workers` and the test helpers from ISSUE-05.

### Test Setup

Each test should:

1. Create an admin user and a regular user via direct DB insertion.
2. Create some diagrams for the regular user (for diagram_count and cascade tests).
3. Use the dev JWT signer to make authenticated requests.
4. Spy on `console.log` to verify audit log emissions.

### Unit / Integration Tests

1. **Non-admin user gets 403 on GET /api/admin/users**
   - Authenticate as a regular user. GET `/api/admin/users`. Assert 403.

2. **Non-admin user gets 403 on PATCH /api/admin/users/:id/role**
   - Authenticate as regular user. PATCH role. Assert 403.

3. **Non-admin user gets 403 on DELETE /api/admin/users/:id**
   - Authenticate as regular user. DELETE user. Assert 403.

4. **Unauthenticated request gets 401 on all admin endpoints**
   - Make requests without auth. Assert 401 for all three endpoints.

5. **List users returns paginated results with diagram_count**
   - Create admin + 2 regular users, some with diagrams.
   - GET `/api/admin/users`. Assert response includes all users with correct `diagram_count`.
   - Assert pagination metadata is present and correct.

6. **List users respects page and limit parameters**
   - Create 5 users. GET with `limit=2&page=2`. Assert `data.users.length <= 2` and `data.pagination.page === 2`.

7. **List users respects sort and order parameters**
   - GET with `sort=email&order=asc`. Assert users are sorted by email ascending.

8. **Search filters by email**
   - Create users with distinct emails. GET with `search=specific-email-substring`. Assert only matching users returned.

9. **Search filters by name**
   - Create users with distinct names. GET with `search=specific-name-substring`. Assert only matching users returned.

10. **Promote user changes role to admin**
    - Create a regular user. PATCH `/api/admin/users/:id/role` with `{ role: "admin" }` as admin.
    - Assert 200, `data.role === "admin"`.

11. **Demote user changes role to user**
    - Create an admin user (not self). PATCH with `{ role: "user" }`.
    - Assert 200, `data.role === "user"`.

12. **Cannot promote/demote self (returns 400)**
    - PATCH `/api/admin/users/:own-id/role` with any role. Assert 400 with code `SELF_ACTION_FORBIDDEN`.

13. **Change role of non-existent user returns 404**
    - PATCH `/api/admin/users/nonexistent/role`. Assert 404.

14. **Invalid role value returns 400**
    - PATCH with `{ role: "superadmin" }`. Assert 400.

15. **Cannot delete self (returns 400)**
    - DELETE `/api/admin/users/:own-id`. Assert 400 with code `SELF_ACTION_FORBIDDEN`.

16. **Delete user cascades diagrams**
    - Create a user with 3 diagrams. DELETE the user as admin.
    - Assert 204. Verify user and all their diagrams are gone from DB.

17. **Delete non-existent user returns 404**
    - DELETE `/api/admin/users/nonexistent`. Assert 404.

18. **Audit log emitted on promote**
    - Spy on `console.log`. Promote a user.
    - Assert `console.log` was called with a JSON string containing `event: "admin_action"`, `action: "promote"`, correct actor/target IDs and emails, and a valid ISO timestamp.

19. **Audit log emitted on demote**
    - Spy on `console.log`. Demote a user.
    - Assert log contains `action: "demote"`.

20. **Audit log emitted on delete**
    - Spy on `console.log`. Delete a user.
    - Assert log contains `action: "delete_user"`.

### Manual Tests

After deploying locally with `npm start`:

```bash
# Set auth tokens (adjust for your dev auth setup)
ADMIN_TOKEN="<admin-dev-jwt>"
USER_TOKEN="<user-dev-jwt>"
AUTH="Authorization: Bearer $ADMIN_TOKEN"

# List users (as admin)
curl -s "http://localhost:8787/api/admin/users?page=1&limit=10&sort=email&order=asc" \
  -H "$AUTH" | jq .

# Search users
curl -s "http://localhost:8787/api/admin/users?search=alice" \
  -H "$AUTH" | jq .

# Promote a user (replace <USER_ID>)
curl -s -X PATCH http://localhost:8787/api/admin/users/<USER_ID>/role \
  -H "Content-Type: application/json" \
  -H "$AUTH" \
  -d '{"role":"admin"}' | jq .

# Demote a user
curl -s -X PATCH http://localhost:8787/api/admin/users/<USER_ID>/role \
  -H "Content-Type: application/json" \
  -H "$AUTH" \
  -d '{"role":"user"}' | jq .

# Try to demote self (should 400)
curl -s -X PATCH http://localhost:8787/api/admin/users/<OWN_ID>/role \
  -H "Content-Type: application/json" \
  -H "$AUTH" \
  -d '{"role":"user"}' | jq .

# Delete a user (replace <USER_ID>)
curl -s -X DELETE http://localhost:8787/api/admin/users/<USER_ID> \
  -H "$AUTH" -w "\nHTTP Status: %{http_code}\n"

# Non-admin gets 403
curl -s http://localhost:8787/api/admin/users \
  -H "Authorization: Bearer $USER_TOKEN" | jq .
```
