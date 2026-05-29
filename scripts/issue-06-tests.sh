#!/usr/bin/env bash
# issue-06-tests.sh — Smoke tests for the /api/diagrams endpoints (ISSUE-06)
#
# Prerequisites:
#   - npm start is already running (wrangler dev on port 8787)
#   - Node.js is available on PATH (to mint the dev JWT)
#
# Usage:
#   bash scripts/issue-06-tests.sh
#
# Optional env vars:
#   EMAIL    — email to authenticate as (default: smoketest@example.com)
#   BASE_URL — worker URL            (default: http://localhost:8787)
#
# The dev JWT is minted automatically via scripts/get-dev-token.mjs using the
# same signDevJwt() function used by the Vitest integration tests, so no
# manual PIN-login step is required.
#
# Exits 0 when all tests pass, 1 when any test fails.

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8787}"
EMAIL="${EMAIL:-smoketest@example.com}"

# Resolve the repo root from the script's own location so the script can be
# run from any working directory.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# ── Mint dev JWT ──────────────────────────────────────────────────────────────

echo ""
echo "Minting dev JWT for <${EMAIL}>..."
JWT_TOKEN="$(node "${SCRIPT_DIR}/get-dev-token.mjs" "${EMAIL}")"
echo "Token: ${JWT_TOKEN:0:40}..."

# cloudflareAccess reads the JWT from the cf-access-jwt-assertion header.
JWT_HEADER_NAME="cf-access-jwt-assertion"
CONTENT="Content-Type: application/json"

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

# authed_request <method> <path> [json-body]
# Sets LAST_STATUS and LAST_BODY.
authed_request() {
  local method="$1" path="$2" body="${3:-}"
  local args=( -s -w "\n%{http_code}"
               -X "$method"
               "${BASE_URL}${path}"
               -H "${JWT_HEADER_NAME}: ${JWT_TOKEN}" )
  [[ -n "$body" ]] && args+=( -H "$CONTENT" -d "$body" )

  local raw
  raw="$(curl "${args[@]}")"
  LAST_STATUS="${raw##*$'\n'}"
  LAST_BODY="${raw%$'\n'*}"
}

# unauthed_request <method> <path>
# Like authed_request but without the JWT header.
unauthed_request() {
  local method="$1" path="$2"
  local raw
  raw="$(curl -s -w "\n%{http_code}" -X "$method" "${BASE_URL}${path}")"
  LAST_STATUS="${raw##*$'\n'}"
  LAST_BODY="${raw%$'\n'*}"
}

# field <jq-expr>  — extract from $LAST_BODY
field() { printf '%s' "$LAST_BODY" | jq -r "$1" 2>/dev/null || printf 'null'; }

# ── 1. User provisioning ──────────────────────────────────────────────────────
# Hit /api/me first so the user row is created in D1 before diagram routes
# attempt to look up the user by email.

echo ""
echo "=== Provision test user ==="

authed_request GET "/api/me"
USER_STATUS="$LAST_STATUS"
check "GET /api/me succeeds (200 or 201)" "$(( USER_STATUS == 200 || USER_STATUS == 201 ))" "1"

# ── 2. Unauthenticated guard ──────────────────────────────────────────────────

echo ""
echo "=== Unauthenticated access (expect 302 redirect) ==="

unauthed_request GET "/api/diagrams"
check "GET /api/diagrams without JWT → 302" "$LAST_STATUS" "302"

# ── 3. Create ─────────────────────────────────────────────────────────────────

echo ""
echo "=== POST /api/diagrams — Create ==="

authed_request POST "/api/diagrams" '{"title":"Smoke Test Diagram"}'
check "201 Created"                          "$LAST_STATUS"                                    "201"
check "data.title correct"                   "$(field '.data.title')"                          "Smoke Test Diagram"
check "data.version is 1"                    "$(field '.data.version')"                        "1"
check "data.id is 26-char ULID"              "$(field '.data.id' | grep -cE '^[0-9A-Za-z]{26}$')" "1"
check "graph_data.nodes is empty array"      "$(field '.data.graph_data.nodes | length')"      "0"
check "graph_data.edges is empty array"      "$(field '.data.graph_data.edges | length')"      "0"
check "graph_data.viewport.x is 0"           "$(field '.data.graph_data.viewport.x')"          "0"
check "graph_data.viewport.zoom is 1"        "$(field '.data.graph_data.viewport.zoom')"       "1"

DIAGRAM_ID="$(field '.data.id')"
echo ""
echo "  Created diagram ID: ${DIAGRAM_ID}"

# Validation failures
authed_request POST "/api/diagrams" '{}'
check "400 on missing title"                 "$LAST_STATUS"              "400"
check "  error.code is VALIDATION_ERROR"     "$(field '.error.code')"    "VALIDATION_ERROR"

authed_request POST "/api/diagrams" '{"title":""}'
check "400 on empty title"                   "$LAST_STATUS"              "400"

LONG_TITLE="$(printf 'x%.0s' {1..81})"
authed_request POST "/api/diagrams" "{\"title\":\"${LONG_TITLE}\"}"
check "400 on title > 80 chars"              "$LAST_STATUS"              "400"

# ── 4. List ───────────────────────────────────────────────────────────────────

echo ""
echo "=== GET /api/diagrams — List ==="

authed_request GET "/api/diagrams"
check "200 OK"                               "$LAST_STATUS"              "200"
check "data is an array with ≥1 entry"       "$(( $(field '.data | length') >= 1 ))" "1"

# ── 5. Get single ─────────────────────────────────────────────────────────────

echo ""
echo "=== GET /api/diagrams/:id — Get single ==="

authed_request GET "/api/diagrams/${DIAGRAM_ID}"
check "200 OK"                               "$LAST_STATUS"              "200"
check "data.id matches"                      "$(field '.data.id')"       "$DIAGRAM_ID"

authed_request GET "/api/diagrams/DOESNOTEXIST00000000000000"
check "404 for nonexistent id"               "$LAST_STATUS"              "404"
check "  error.code is NOT_FOUND"            "$(field '.error.code')"    "NOT_FOUND"

# ── 6. Rename (PATCH) ─────────────────────────────────────────────────────────

echo ""
echo "=== PATCH /api/diagrams/:id — Rename ==="

authed_request PATCH "/api/diagrams/${DIAGRAM_ID}" '{"title":"Renamed Diagram"}'
check "200 OK"                               "$LAST_STATUS"              "200"
check "data.title updated"                   "$(field '.data.title')"    "Renamed Diagram"
check "data.version still 1 (no bump)"       "$(field '.data.version')"  "1"

authed_request PATCH "/api/diagrams/${DIAGRAM_ID}" '{"title":""}'
check "400 on empty title"                   "$LAST_STATUS"              "400"

# ── 7. Full update — correct version ─────────────────────────────────────────

echo ""
echo "=== PUT /api/diagrams/:id — Full update (correct version) ==="

UPDATE_BODY='{"title":"Updated Title","graph_data":{"nodes":[{"id":"n1","type":"workers","position":{"x":100,"y":200},"data":{"label":"My Worker"}}],"edges":[]},"version":1}'
authed_request PUT "/api/diagrams/${DIAGRAM_ID}" "$UPDATE_BODY"
check "200 OK"                               "$LAST_STATUS"                                  "200"
check "data.version incremented to 2"        "$(field '.data.version')"                      "2"
check "data.title updated"                   "$(field '.data.title')"                        "Updated Title"
check "graph_data has 1 node"                "$(field '.data.graph_data.nodes | length')"    "1"

# ── 8. Full update — stale version → 409 ─────────────────────────────────────

echo ""
echo "=== PUT /api/diagrams/:id — Stale version → 409 ==="

authed_request PUT "/api/diagrams/${DIAGRAM_ID}" \
  '{"title":"Stale","graph_data":{"nodes":[],"edges":[]},"version":1}'
check "409 Conflict"                         "$LAST_STATUS"              "409"
check "  error.code is CONFLICT"             "$(field '.error.code')"    "CONFLICT"

# ── 9. Full update — invalid graph_data → 400 ────────────────────────────────

echo ""
echo "=== PUT /api/diagrams/:id — Invalid graph_data → 400 ==="

authed_request PUT "/api/diagrams/${DIAGRAM_ID}" \
  '{"title":"Test","graph_data":{"bad":true},"version":2}'
check "400 Bad Request"                      "$LAST_STATUS"              "400"
check "  error.code is VALIDATION_ERROR"     "$(field '.error.code')"    "VALIDATION_ERROR"

# ── 10. Duplicate ─────────────────────────────────────────────────────────────

echo ""
echo "=== POST /api/diagrams/:id/duplicate — Duplicate ==="

authed_request POST "/api/diagrams/${DIAGRAM_ID}/duplicate"
check "201 Created"                          "$LAST_STATUS"              "201"
check "copy title has '(Copy)' suffix"       "$(field '.data.title')"    "Updated Title (Copy)"
check "copy version is 1"                    "$(field '.data.version')"  "1"
check "copy has a different id"              "$([ "$(field '.data.id')" != "$DIAGRAM_ID" ] && echo 1 || echo 0)" "1"

COPY_ID="$(field '.data.id')"

authed_request POST "/api/diagrams/DOESNOTEXIST00000000000000/duplicate"
check "404 for nonexistent source"           "$LAST_STATUS"              "404"

# ── 11. Delete ────────────────────────────────────────────────────────────────

echo ""
echo "=== DELETE /api/diagrams/:id — Delete ==="

authed_request DELETE "/api/diagrams/${COPY_ID}"
check "204 No Content"                       "$LAST_STATUS"              "204"

authed_request GET "/api/diagrams/${COPY_ID}"
check "404 after deletion"                   "$LAST_STATUS"              "404"

authed_request DELETE "/api/diagrams/DOESNOTEXIST00000000000000"
check "404 for nonexistent diagram"          "$LAST_STATUS"              "404"

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
