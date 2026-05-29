#!/usr/bin/env bash
# issue-08-tests.sh — Smoke tests for GET /api/catalog (ISSUE-08)
#
# Prerequisites:
#   - npm start is already running (wrangler dev on port 8787)
#   - Node.js is available on PATH (to mint the dev JWT)
#   - jq is available on PATH
#
# Usage:
#   bash scripts/issue-08-tests.sh
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

# ── Mint dev JWT ──────────────────────────────────────────────────────────────

echo ""
echo "Minting dev JWT for <${EMAIL}>..."
JWT_TOKEN="$(node "${SCRIPT_DIR}/get-dev-token.mjs" "${EMAIL}")"
echo "Token: ${JWT_TOKEN:0:40}..."

# cloudflareAccess reads the JWT from the cf-access-jwt-assertion header.
JWT_HEADER_NAME="cf-access-jwt-assertion"

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

# authed_request <method> <path>
# Sets LAST_STATUS and LAST_BODY.
authed_request() {
  local method="$1" path="$2"
  local raw
  raw="$(curl -s -w "\n%{http_code}" \
             -X "$method" \
             "${BASE_URL}${path}" \
             -H "${JWT_HEADER_NAME}: ${JWT_TOKEN}")"
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

# ── 1. Unauthenticated guard ──────────────────────────────────────────────────

echo ""
echo "=== Unauthenticated access (expect 302 redirect) ==="

unauthed_request GET "/api/catalog"
check "GET /api/catalog without JWT → 302" "$LAST_STATUS" "302"

# ── 2. Authenticated request succeeds ────────────────────────────────────────

echo ""
echo "=== GET /api/catalog — Authenticated ==="

authed_request GET "/api/catalog"
check "200 OK" "$LAST_STATUS" "200"

# ── 3. Response shape ─────────────────────────────────────────────────────────

echo ""
echo "=== Response shape ==="

check "data.services is an array"   "$(field '.data.services | type')"   "array"
check "data.categories is an array" "$(field '.data.categories | type')" "array"
check "data.edgeTypes is an array"  "$(field '.data.edgeTypes | type')"  "array"

# ── 4. Service counts ─────────────────────────────────────────────────────────

echo ""
echo "=== Service counts ==="

TOTAL_SERVICES="$(field '.data.services | length')"
check "Total services >= 27"                  "$(( TOTAL_SERVICES >= 27 ))"  "1"
echo "  Total services: ${TOTAL_SERVICES}"

DP_COUNT="$(field '[.data.services[] | select(.category=="developer-platform")] | length')"
check "Developer Platform services >= 15"    "$(( DP_COUNT >= 15 ))"  "1"
echo "  Developer Platform: ${DP_COUNT}"

ZT_COUNT="$(field '[.data.services[] | select(.category=="zero-trust")] | length')"
check "Zero Trust services >= 4"             "$(( ZT_COUNT >= 4 ))"   "1"
echo "  Zero Trust: ${ZT_COUNT}"

CDN_COUNT="$(field '[.data.services[] | select(.category=="cdn-application")] | length')"
check "CDN/Application services >= 8"        "$(( CDN_COUNT >= 8 ))"  "1"
echo "  CDN / Application: ${CDN_COUNT}"

# ── 5. TypeId uniqueness and format ───────────────────────────────────────────

echo ""
echo "=== TypeId uniqueness and format ==="

UNIQUE_COUNT="$(field '[.data.services[].typeId] | unique | length')"
check "All typeIds are unique ($UNIQUE_COUNT distinct)" \
  "$UNIQUE_COUNT" "$TOTAL_SERVICES"

# Check every typeId matches lowercase-kebab-case using jq regex.
INVALID_IDS="$(field '[.data.services[] | select(.typeId | test("^[a-z][a-z0-9-]*$") | not) | .typeId] | join(", ")')"
check "All typeIds are lowercase-kebab-case (invalid: '${INVALID_IDS}')" \
  "$INVALID_IDS" ""

# ── 6. Required fields on every service ──────────────────────────────────────

echo ""
echo "=== Required fields on every service ==="

# Count services missing any required field.
MISSING_FIELDS="$(field '
  [.data.services[] |
    select(
      (.typeId | length) == 0 or
      (.officialName | length) == 0 or
      (.shortName | length) == 0 or
      (.category | length) == 0 or
      (.iconPath | length) == 0 or
      (.docUrl | length) == 0
    ) | .typeId
  ] | length')"
check "All services have all required fields (missing: ${MISSING_FIELDS})" \
  "$MISSING_FIELDS" "0"

# All docUrls must start with https://.
INVALID_URLS="$(field '
  [.data.services[] |
    select(.docUrl | startswith("https://") | not) | .typeId
  ] | join(", ")')"
check "All docUrls start with https:// (invalid: '${INVALID_URLS}')" \
  "$INVALID_URLS" ""

# ── 7. Spot-check specific services ──────────────────────────────────────────

echo ""
echo "=== Spot-check specific services ==="

WORKERS_NAME="$(field '.data.services[] | select(.typeId=="workers") | .officialName')"
check "workers → officialName is 'Cloudflare Workers'"   "$WORKERS_NAME"  "Cloudflare Workers"
WORKERS_CAT="$(field  '.data.services[] | select(.typeId=="workers") | .category')"
check "workers → category is 'developer-platform'"       "$WORKERS_CAT"   "developer-platform"
WORKERS_ICON="$(field '.data.services[] | select(.typeId=="workers") | .iconPath')"
check "workers → iconPath is 'workers.svg'"              "$WORKERS_ICON"  "workers.svg"

D1_NAME="$(field '.data.services[] | select(.typeId=="d1") | .officialName')"
check "d1 → officialName is 'Cloudflare D1'"             "$D1_NAME"       "Cloudflare D1"

ACCESS_CAT="$(field '.data.services[] | select(.typeId=="access") | .category')"
check "access → category is 'zero-trust'"                "$ACCESS_CAT"    "zero-trust"

WAF_CAT="$(field '.data.services[] | select(.typeId=="waf") | .category')"
check "waf → category is 'cdn-application'"              "$WAF_CAT"       "cdn-application"

# ── 8. Categories ─────────────────────────────────────────────────────────────

echo ""
echo "=== Categories ==="

check "Exactly 4 categories" "$(field '.data.categories | length')" "4"

check "developer-platform → color is #2563eb" \
  "$(field '.data.categories[] | select(.id=="developer-platform") | .color')" \
  "#2563eb"

check "zero-trust → color is #16a34a" \
  "$(field '.data.categories[] | select(.id=="zero-trust") | .color')" \
  "#16a34a"

check "cdn-application → color is #ea580c" \
  "$(field '.data.categories[] | select(.id=="cdn-application") | .color')" \
  "#ea580c"

check "other → color is #6b7280" \
  "$(field '.data.categories[] | select(.id=="other") | .color')" \
  "#6b7280"

# Every category has a non-empty label.
MISSING_LABELS="$(field '
  [.data.categories[] | select((.label | length) == 0) | .id] | length')"
check "All categories have a non-empty label (missing: ${MISSING_LABELS})" \
  "$MISSING_LABELS" "0"

# ── 9. Edge types ─────────────────────────────────────────────────────────────

echo ""
echo "=== Edge types ==="

check "Exactly 4 edge types" "$(field '.data.edgeTypes | length')" "4"

for et_id in data-flow binding trigger dependency; do
  check "Edge type '${et_id}' is present" \
    "$(field ".data.edgeTypes[] | select(.id==\"${et_id}\") | .id")" \
    "$et_id"
done

check "data-flow → style is solid" \
  "$(field '.data.edgeTypes[] | select(.id=="data-flow") | .style')"   "solid"
check "binding → style is dashed" \
  "$(field '.data.edgeTypes[] | select(.id=="binding") | .style')"     "dashed"
check "trigger → style is dotted" \
  "$(field '.data.edgeTypes[] | select(.id=="trigger") | .style')"     "dotted"
check "dependency → style is animated" \
  "$(field '.data.edgeTypes[] | select(.id=="dependency") | .style')"  "animated"

# Every edge type has a non-empty label and a valid style.
INVALID_STYLES="$(field '
  [.data.edgeTypes[] |
    select(
      .style as $s |
      (["solid","dashed","dotted","animated"] | contains([$s])) | not
    ) | .id
  ] | join(", ")')"
check "All edge types have a valid style (invalid: '${INVALID_STYLES}')" \
  "$INVALID_STYLES" ""

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
