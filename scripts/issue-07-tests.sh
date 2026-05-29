#!/usr/bin/env bash
# issue-07-tests.sh — Smoke tests for the /api/admin/users endpoints (ISSUE-07)
#
# Prerequisites:
#   - npm start is already running (wrangler dev on port 8787)
#   - Node.js is available on PATH (to mint dev JWTs)
#   - jq is available on PATH
#
# Usage:
#   bash scripts/issue-07-tests.sh
#
# Optional env vars:
#   ADMIN_EMAIL  — Email provisioned as admin. MUST match SEED_ADMIN_EMAIL in
#                  src/worker/wrangler.jsonc so /api/me auto-assigns role="admin".
#                  The script tries to auto-detect this from wrangler.jsonc first.
#                  (default: auto-detected, or "admin@example.com" as fallback)
#   USER_EMAIL   — A regular (non-admin) user email used for 403 guard tests.
#                  (default: smoketest-user07@example.com)
#   BASE_URL     — Worker URL (default: http://localhost:8787)
#
# The script provisions three users automatically via /api/me:
#   - ADMIN_EMAIL    → becomes admin (matched by SEED_ADMIN_EMAIL)
#   - USER_EMAIL     → role=user, used for 403 tests
#   - TARGET_EMAIL   → role=user, target for promote/demote tests
#   - DELETE_EMAIL   → role=user, target for delete + cascade tests
#
# Audit log entries for mutations are written to the wrangler dev console.
# Look for lines containing '"event":"admin_action"' in the npm start output.
#
# Exits 0 when all tests pass, 1 when any test fails.

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8787}"
USER_EMAIL="${USER_EMAIL:-smoketest-user07@example.com}"

TARGET_EMAIL="smoketest-target07@example.com"
DELETE_EMAIL="smoketest-delete07@example.com"

# Resolve repo root so the script works from any working directory.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
WRANGLER_JSONC="${REPO_ROOT}/src/worker/wrangler.jsonc"

# ── Auto-detect ADMIN_EMAIL from wrangler.jsonc ───────────────────────────────

if [[ -z "${ADMIN_EMAIL:-}" ]]; then
  if [[ -f "$WRANGLER_JSONC" ]]; then
    # Strip JSONC single-line comments, then extract SEED_ADMIN_EMAIL with grep.
    ADMIN_EMAIL="$(grep -oE '"SEED_ADMIN_EMAIL"[[:space:]]*:[[:space:]]*"[^"]+"' \
      "$WRANGLER_JSONC" 2>/dev/null \
      | grep -oE '"[^"]+"[[:space:]]*$' \
      | tr -d '" ' \
      || true)"
  fi
  ADMIN_EMAIL="${ADMIN_EMAIL:-admin@example.com}"
fi

echo ""
echo "Configuration:"
echo "  BASE_URL     : ${BASE_URL}"
echo "  ADMIN_EMAIL  : ${ADMIN_EMAIL}"
echo "  USER_EMAIL   : ${USER_EMAIL}"
echo "  TARGET_EMAIL : ${TARGET_EMAIL}"
echo "  DELETE_EMAIL : ${DELETE_EMAIL}"

# ── Mint dev JWTs ─────────────────────────────────────────────────────────────

echo ""
echo "Minting dev JWTs..."
ADMIN_TOKEN="$(node "${SCRIPT_DIR}/get-dev-token.mjs" "${ADMIN_EMAIL}")"
USER_TOKEN="$(node "${SCRIPT_DIR}/get-dev-token.mjs" "${USER_EMAIL}")"
TARGET_TOKEN="$(node "${SCRIPT_DIR}/get-dev-token.mjs" "${TARGET_EMAIL}")"
DELETE_TOKEN="$(node "${SCRIPT_DIR}/get-dev-token.mjs" "${DELETE_EMAIL}")"
echo "  Admin  token : ${ADMIN_TOKEN:0:40}..."
echo "  User   token : ${USER_TOKEN:0:40}..."

JWT_HEADER="cf-access-jwt-assertion"
CONTENT_TYPE="Content-Type: application/json"

# ── Health check ──────────────────────────────────────────────────────────────

echo ""
echo "Checking ${BASE_URL} is reachable..."
if ! curl -sf -o /dev/null "${BASE_URL}/api/version" 2>/dev/null; then
  echo "ERROR: Worker is not reachable at ${BASE_URL}."
  echo "       Run 'npm start' in another terminal first."
  exit 1
fi
echo "Worker is up."

# ── Counters and helpers ──────────────────────────────────────────────────────

PASS=0
FAIL=0

# check <label> <actual> <expected>
check() {
  local label="$1" actual="$2" expected="$3"
  if [[ "$actual" == "$expected" ]]; then
    printf "  \033[32mPASS\033[0m  %s\n" "$label"
    (( PASS++ )) || true
  else
    printf "  \033[31mFAIL\033[0m  %s\n" "$label"
    printf "        expected: %s\n" "$expected"
    printf "        actual:   %s\n" "$actual"
    (( FAIL++ )) || true
  fi
}

# as_admin <method> <path> [json-body]
# Sends an authenticated request as the admin. Sets LAST_STATUS and LAST_BODY.
as_admin() {
  local method="$1" path="$2" body="${3:-}"
  local args=( -s -w "\n%{http_code}"
               -X "$method"
               "${BASE_URL}${path}"
               -H "${JWT_HEADER}: ${ADMIN_TOKEN}" )
  [[ -n "$body" ]] && args+=( -H "$CONTENT_TYPE" -d "$body" )
  local raw
  raw="$(curl "${args[@]}")"
  LAST_STATUS="${raw##*$'\n'}"
  LAST_BODY="${raw%$'\n'*}"
}

# as_user <method> <path> [json-body]
# Sends an authenticated request as the non-admin user.
as_user() {
  local method="$1" path="$2" body="${3:-}"
  local args=( -s -w "\n%{http_code}"
               -X "$method"
               "${BASE_URL}${path}"
               -H "${JWT_HEADER}: ${USER_TOKEN}" )
  [[ -n "$body" ]] && args+=( -H "$CONTENT_TYPE" -d "$body" )
  local raw
  raw="$(curl "${args[@]}")"
  LAST_STATUS="${raw##*$'\n'}"
  LAST_BODY="${raw%$'\n'*}"
}

# as_token <token> <method> <path> [json-body]
# Sends an authenticated request using an arbitrary token.
as_token() {
  local token="$1" method="$2" path="$3" body="${4:-}"
  local args=( -s -w "\n%{http_code}"
               -X "$method"
               "${BASE_URL}${path}"
               -H "${JWT_HEADER}: ${token}" )
  [[ -n "$body" ]] && args+=( -H "$CONTENT_TYPE" -d "$body" )
  local raw
  raw="$(curl "${args[@]}")"
  LAST_STATUS="${raw##*$'\n'}"
  LAST_BODY="${raw%$'\n'*}"
}

# unauthed <method> <path>
# Sends a request with no JWT header.
unauthed() {
  local method="$1" path="$2"
  local raw
  raw="$(curl -s -w "\n%{http_code}" -X "$method" "${BASE_URL}${path}")"
  LAST_STATUS="${raw##*$'\n'}"
  LAST_BODY="${raw%$'\n'*}"
}

# field <jq-expr>  — extract from $LAST_BODY
field() { printf '%s' "$LAST_BODY" | jq -r "$1" 2>/dev/null || printf 'null'; }

# ── 1. Provision all test users ───────────────────────────────────────────────
# Each user is auto-provisioned on first /api/me hit. The admin user gets
# role="admin" because their email matches SEED_ADMIN_EMAIL in wrangler.jsonc.

echo ""
echo "=== Provision test users ==="

as_admin GET "/api/me"
check "Admin /api/me succeeds (200 or 201)" \
  "$(( LAST_STATUS == 200 || LAST_STATUS == 201 ))" "1"
ADMIN_ROLE="$(field '.data.role')"
check "Admin has role=admin (SEED_ADMIN_EMAIL matches)" "$ADMIN_ROLE" "admin"
ADMIN_ID="$(field '.data.id')"
echo "  Admin ID: ${ADMIN_ID}"

as_user GET "/api/me"
check "User /api/me succeeds (200 or 201)" \
  "$(( LAST_STATUS == 200 || LAST_STATUS == 201 ))" "1"

as_token "$TARGET_TOKEN" GET "/api/me"
check "Target /api/me succeeds (200 or 201)" \
  "$(( LAST_STATUS == 200 || LAST_STATUS == 201 ))" "1"
TARGET_ID="$(field '.data.id')"
echo "  Target ID: ${TARGET_ID}"

as_token "$DELETE_TOKEN" GET "/api/me"
check "Delete-target /api/me succeeds (200 or 201)" \
  "$(( LAST_STATUS == 200 || LAST_STATUS == 201 ))" "1"
DELETE_ID="$(field '.data.id')"
echo "  Delete-target ID: ${DELETE_ID}"

# ── 2. Unauthenticated guard (all three admin endpoints) ──────────────────────

echo ""
echo "=== Unauthenticated access (expect 302 redirect) ==="

unauthed GET "/api/admin/users"
check "GET /api/admin/users without JWT → 302"            "$LAST_STATUS"  "302"

unauthed PATCH "/api/admin/users/${TARGET_ID}/role"
check "PATCH /api/admin/users/:id/role without JWT → 302" "$LAST_STATUS"  "302"

unauthed DELETE "/api/admin/users/${TARGET_ID}"
check "DELETE /api/admin/users/:id without JWT → 302"     "$LAST_STATUS"  "302"

# ── 3. Non-admin 403 guard (all three admin endpoints) ───────────────────────

echo ""
echo "=== Non-admin access (expect 403 Forbidden) ==="

as_user GET "/api/admin/users"
check "GET /api/admin/users as non-admin → 403"                  "$LAST_STATUS"          "403"
check "  error.code is FORBIDDEN"                                "$(field '.error.code')" "FORBIDDEN"

as_user PATCH "/api/admin/users/${TARGET_ID}/role" '{"role":"admin"}'
check "PATCH /api/admin/users/:id/role as non-admin → 403"       "$LAST_STATUS"          "403"

as_user DELETE "/api/admin/users/${TARGET_ID}"
check "DELETE /api/admin/users/:id as non-admin → 403"           "$LAST_STATUS"          "403"

# ── 4. GET /api/admin/users — List ───────────────────────────────────────────

echo ""
echo "=== GET /api/admin/users — Paginated user list ==="

as_admin GET "/api/admin/users"
check "200 OK"                                        "$LAST_STATUS"                        "200"
check "data.users is present"                         "$(field '.data.users | type')"       "array"
check "data.pagination.page is 1"                     "$(field '.data.pagination.page')"    "1"
check "data.pagination.limit is 20"                   "$(field '.data.pagination.limit')"   "20"
check "data.pagination.total is a number"             "$(( $(field '.data.pagination.total') >= 1 ))" "1"
check "data.pagination.totalPages is a number"        "$(( $(field '.data.pagination.totalPages') >= 1 ))" "1"
check "each user has diagram_count field"             "$(field '.data.users[0] | has("diagram_count")')" "true"
check "each user has id, email, role fields"          "$(field '.data.users[0] | [has("id"), has("email"), has("role")] | all')" "true"

# Snapshot the target's current diagram_count before adding another diagram.
# (The user persists between runs, so the count may already be > 0.)
as_admin GET "/api/admin/users?search=smoketest-target07"
COUNT_BEFORE="$(field ".data.users[] | select(.id == \"${TARGET_ID}\") | .diagram_count")"

# Create a diagram as the target user so we can verify diagram_count increments.
as_token "$TARGET_TOKEN" POST "/api/diagrams" '{"title":"Smoke Test Diagram for Admin Count"}'
check "Target user can create a diagram (201)"        "$LAST_STATUS"  "201"
DIAGRAM_ID="$(field '.data.id')"
echo "  Target's diagram ID: ${DIAGRAM_ID}"

# Verify diagram_count increased by exactly 1.
as_admin GET "/api/admin/users?search=smoketest-target07"
TARGET_COUNT="$(field ".data.users[] | select(.id == \"${TARGET_ID}\") | .diagram_count")"
EXPECTED_COUNT="$(( COUNT_BEFORE + 1 ))"
check "Target user diagram_count increased by 1 after creating diagram" \
  "$TARGET_COUNT" "$EXPECTED_COUNT"

# Search by email substring.
SEARCH_TERM="smoketest-target07"
as_admin GET "/api/admin/users?search=${SEARCH_TERM}"
check "Search by email substring returns 1 result"    "$(field '.data.users | length')"     "1"
check "Search result email matches"                   "$(field '.data.users[0].email')"     "$TARGET_EMAIL"
check "Search pagination.total is 1"                  "$(field '.data.pagination.total')"   "1"

# Sort by email ascending — use jq to verify the full list equals its sorted form.
as_admin GET "/api/admin/users?sort=email&order=asc&limit=100"
check "sort=email&order=asc returns 200"              "$LAST_STATUS"  "200"
check "Emails are in ascending lexicographic order" \
  "$(field '[.data.users[].email] | . == sort')"  "true"

# Pagination with page=1&limit=2.
as_admin GET "/api/admin/users?page=1&limit=2"
check "page=1&limit=2 → at most 2 users returned"    "$(( $(field '.data.users | length') <= 2 ))" "1"
check "pagination.limit is 2"                         "$(field '.data.pagination.limit')"    "2"
check "pagination.page is 1"                          "$(field '.data.pagination.page')"     "1"

# Limit is clamped to 100.
as_admin GET "/api/admin/users?limit=999"
check "limit=999 is clamped to 100"                   "$(field '.data.pagination.limit')"    "100"

# ── 5. PATCH /api/admin/users/:id/role — Promote / Demote ────────────────────

echo ""
echo "=== PATCH /api/admin/users/:id/role — Promote / Demote ==="

# Promote target to admin.
as_admin PATCH "/api/admin/users/${TARGET_ID}/role" '{"role":"admin"}'
check "200 on promote"                                "$LAST_STATUS"                        "200"
check "data.role is admin after promote"              "$(field '.data.role')"               "admin"
check "data.id matches target"                        "$(field '.data.id')"                 "$TARGET_ID"
check "PATCH response includes diagram_count field"   "$(field '.data | has("diagram_count")')" "true"

# Demote back to user.
as_admin PATCH "/api/admin/users/${TARGET_ID}/role" '{"role":"user"}'
check "200 on demote"                                 "$LAST_STATUS"                        "200"
check "data.role is user after demote"                "$(field '.data.role')"               "user"

# Self-action: admin tries to change their own role.
as_admin PATCH "/api/admin/users/${ADMIN_ID}/role" '{"role":"user"}'
check "400 when admin targets own id"                 "$LAST_STATUS"                        "400"
check "  error.code is SELF_ACTION_FORBIDDEN"         "$(field '.error.code')"              "SELF_ACTION_FORBIDDEN"

# Invalid role value.
as_admin PATCH "/api/admin/users/${TARGET_ID}/role" '{"role":"superadmin"}'
check "400 for invalid role value"                    "$LAST_STATUS"                        "400"
check "  error.code is VALIDATION_ERROR"              "$(field '.error.code')"              "VALIDATION_ERROR"

# Non-existent user.
as_admin PATCH "/api/admin/users/DOESNOTEXIST00000000000000/role" '{"role":"admin"}'
check "404 for nonexistent user"                      "$LAST_STATUS"                        "404"
check "  error.code is NOT_FOUND"                     "$(field '.error.code')"              "NOT_FOUND"

# ── 6. DELETE /api/admin/users/:id — Delete + cascade ────────────────────────

echo ""
echo "=== DELETE /api/admin/users/:id — Delete + cascade ==="

# Self-action: admin tries to delete themselves.
as_admin DELETE "/api/admin/users/${ADMIN_ID}"
check "400 when admin targets own id"                 "$LAST_STATUS"                        "400"
check "  error.code is SELF_ACTION_FORBIDDEN"         "$(field '.error.code')"              "SELF_ACTION_FORBIDDEN"

# Non-existent user.
as_admin DELETE "/api/admin/users/DOESNOTEXIST00000000000000"
check "404 for nonexistent user"                      "$LAST_STATUS"                        "404"
check "  error.code is NOT_FOUND"                     "$(field '.error.code')"              "NOT_FOUND"

# Verify delete-target currently exists and has 0 diagrams.
as_admin GET "/api/admin/users?search=smoketest-delete07"
check "Delete-target is visible in list before deletion" "$(field '.data.users | length')" "1"

# Create a diagram for the delete-target to test cascade.
as_token "$DELETE_TOKEN" POST "/api/diagrams" '{"title":"Diagram to be cascade-deleted"}'
check "Delete-target can create a diagram (201)"      "$LAST_STATUS"                        "201"

# Confirm diagram_count is 1 for delete-target.
as_admin GET "/api/admin/users?search=smoketest-delete07"
DELETE_COUNT="$(field ".data.users[] | select(.id == \"${DELETE_ID}\") | .diagram_count")"
check "Delete-target diagram_count is 1 before deletion" "$DELETE_COUNT"                   "1"

# Delete the user.
as_admin DELETE "/api/admin/users/${DELETE_ID}"
check "204 on successful deletion"                    "$LAST_STATUS"                        "204"

# Verify the user is gone from the admin list.
as_admin GET "/api/admin/users?search=smoketest-delete07"
check "Deleted user no longer appears in list"        "$(field '.data.users | length')"     "0"
check "Total count is 0 after deletion"               "$(field '.data.pagination.total')"   "0"

# ── 7. Audit log reminder ─────────────────────────────────────────────────────

echo ""
echo "=== Audit log (manual check) ==="
echo "  Admin mutations above emitted structured JSON audit entries to the"
echo "  wrangler dev console. Look for lines like:"
echo "    {\"event\":\"admin_action\",\"action\":\"promote\",...}"
echo "    {\"event\":\"admin_action\",\"action\":\"demote\",...}"
echo "    {\"event\":\"admin_action\",\"action\":\"delete_user\",...}"
echo "  in the 'npm start' terminal output."

# ── Summary ───────────────────────────────────────────────────────────────────

echo ""
echo "================================================="
printf "  Results: \033[32m%d passed\033[0m, " "$PASS"
if (( FAIL > 0 )); then
  printf "\033[31m%d failed\033[0m\n" "$FAIL"
else
  printf "\033[32m%d failed\033[0m\n" "$FAIL"
fi
echo "================================================="
echo ""

(( FAIL == 0 ))
