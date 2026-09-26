#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# MergeGuard — manual API smoke-test script
#
# Usage:
#   ./test-api.sh                            # uses default http://localhost:5001
#   BASE_URL=http://localhost:3001 ./test-api.sh
#   PR_URL="https://github.com/owner/repo/pull/123" ./test-api.sh
#
# Requires: curl, python3 (for pretty-printing JSON)
# ─────────────────────────────────────────────────────────────────────────────

BASE_URL="${BASE_URL:-http://localhost:5001}"
PR_URL="${PR_URL:-https://github.com/torvalds/linux/pull/1}"   # safe public PR for demo

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

pass() { echo -e "${GREEN}✓ PASS${RESET} $1"; }
fail() { echo -e "${RED}✗ FAIL${RESET} $1"; FAILURES=$((FAILURES+1)); }
header() { echo -e "\n${BOLD}${CYAN}══ $1 ══${RESET}"; }

FAILURES=0

# ── helper: assert HTTP status ────────────────────────────────────────────────
assert_status() {
  local label="$1" expected="$2" url="$3" method="${4:-GET}" body="$5"
  local actual
  if [ -n "$body" ]; then
    actual=$(curl -s -o /dev/null -w "%{http_code}" -X "$method" "$url" \
      -H "Content-Type: application/json" -d "$body")
  else
    actual=$(curl -s -o /dev/null -w "%{http_code}" -X "$method" "$url")
  fi

  if [ "$actual" = "$expected" ]; then
    pass "$label (HTTP $actual)"
  else
    fail "$label — expected HTTP $expected, got $actual"
  fi
}

# ── helper: pretty-print JSON response ───────────────────────────────────────
show_response() {
  local label="$1" url="$2" method="${3:-GET}" body="$4"
  echo -e "\n${CYAN}▶ $label${RESET}"
  if [ -n "$body" ]; then
    curl -s -X "$method" "$url" -H "Content-Type: application/json" -d "$body" \
      | python3 -m json.tool 2>/dev/null || echo "(non-JSON response)"
  else
    curl -s "$url" | python3 -m json.tool 2>/dev/null || echo "(non-JSON response)"
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
header "1. Health check"
assert_status "GET /health → 200" "200" "$BASE_URL/health"
show_response "GET /health" "$BASE_URL/health"

# ─────────────────────────────────────────────────────────────────────────────
header "2. Input validation"
assert_status "Missing prUrl → 400"    "400" "$BASE_URL/api/analyze-pr" "POST" '{}'
assert_status "Non-GitHub URL → 400"   "400" "$BASE_URL/api/analyze-pr" "POST" \
  '{"prUrl":"https://gitlab.com/owner/repo/pull/1"}'
assert_status "Bare GitHub URL → 400"  "400" "$BASE_URL/api/analyze-pr" "POST" \
  '{"prUrl":"https://github.com/owner/repo"}'
assert_status "Not a URL at all → 400" "400" "$BASE_URL/api/analyze-pr" "POST" \
  '{"prUrl":"just-a-string"}'

show_response "Validation error body" "$BASE_URL/api/analyze-pr" "POST" '{}'

# ─────────────────────────────────────────────────────────────────────────────
header "3. 404 for unknown routes"
assert_status "GET /api/unknown → 404" "404" "$BASE_URL/api/unknown"

# ─────────────────────────────────────────────────────────────────────────────
header "4. Live PR analysis (requires GITHUB_TOKEN for rate-limit headroom)"
echo -e "${CYAN}▶ POST /api/analyze-pr${RESET} with PR_URL=${PR_URL}"
echo ""
RESPONSE=$(curl -s -X POST "$BASE_URL/api/analyze-pr" \
  -H "Content-Type: application/json" \
  -d "{\"prUrl\":\"$PR_URL\"}")

HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/api/analyze-pr" \
  -H "Content-Type: application/json" \
  -d "{\"prUrl\":\"$PR_URL\"}")

echo "$RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE"
echo ""

if echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); sys.exit(0 if 'data' in d and 'healthScore' in d['data'] else 1)" 2>/dev/null; then
  pass "Response contains data.healthScore"
else
  if [ "$HTTP_STATUS" = "404" ] || [ "$HTTP_STATUS" = "403" ]; then
    echo -e "${CYAN}ℹ  GitHub returned $HTTP_STATUS — set a valid GITHUB_TOKEN or use a real public PR URL${RESET}"
    echo -e "${CYAN}   Example: PR_URL=https://github.com/expressjs/express/pull/5952 ./test-api.sh${RESET}"
  else
    fail "Response missing data.healthScore (HTTP $HTTP_STATUS)"
  fi
fi

# ─────────────────────────────────────────────────────────────────────────────
echo ""
if [ "$FAILURES" -eq 0 ]; then
  echo -e "${GREEN}${BOLD}All checks passed ✓${RESET}"
else
  echo -e "${RED}${BOLD}$FAILURES check(s) failed ✗${RESET}"
  exit 1
fi
