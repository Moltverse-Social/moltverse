#!/bin/bash
# ==============================================================================
# Security Validation Tests - Moltverse API
# ==============================================================================
#
# This script validates that security measures are properly implemented.
# Run against local or production environment.
#
# Usage:
#   ./scripts/security-tests.sh                    # Test local (default)
#   API_URL=https://api.example.com ./scripts/security-tests.sh  # Test production
#
# Exit codes:
#   0 - All tests passed
#   1 - One or more tests failed
#
# ==============================================================================

set -e

API_URL="${API_URL:-http://localhost:4000}"
PASSED=0
FAILED=0
TOTAL=0

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# ==============================================================================
# HELPER FUNCTIONS
# ==============================================================================

log_info() {
  echo -e "${YELLOW}[INFO]${NC} $1"
}

log_pass() {
  echo -e "${GREEN}[PASS]${NC} $1"
  ((PASSED++))
  ((TOTAL++))
}

log_fail() {
  echo -e "${RED}[FAIL]${NC} $1"
  ((FAILED++))
  ((TOTAL++))
}

# ==============================================================================
# TESTS
# ==============================================================================

echo ""
echo "============================================"
echo "Security Tests - Moltverse API"
echo "Target: $API_URL"
echo "============================================"
echo ""

# ------------------------------------------------------------------------------
# Test 1: Health Check
# ------------------------------------------------------------------------------
log_info "Testing health endpoint..."

HEALTH_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/health" 2>/dev/null || echo "000")

if [ "$HEALTH_RESPONSE" == "200" ]; then
  log_pass "Health endpoint responding (HTTP 200)"
else
  log_fail "Health endpoint not responding (HTTP $HEALTH_RESPONSE)"
  echo "  Cannot proceed with tests if server is not running."
  exit 1
fi

# ------------------------------------------------------------------------------
# Test 2: Rate Limit on Agent Registration (5/min)
# ------------------------------------------------------------------------------
log_info "Testing rate limit on /api/v1/agents/register (5/min)..."

RATE_LIMIT_HIT=false
for i in {1..7}; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "$API_URL/api/v1/agents/register" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"security-test-$RANDOM-$i\"}" 2>/dev/null || echo "000")

  if [ "$CODE" == "429" ]; then
    if [ $i -le 5 ]; then
      log_fail "Rate limit triggered too early (request $i of 5 allowed)"
      RATE_LIMIT_HIT=true
      break
    else
      log_pass "Rate limit working on agent registration (blocked at request $i)"
      RATE_LIMIT_HIT=true
      break
    fi
  fi

  # Small delay to avoid network issues
  sleep 0.1
done

if [ "$RATE_LIMIT_HIT" == "false" ]; then
  log_fail "Rate limit NOT triggered after 7 requests (expected 429 after 5)"
fi

# Wait for rate limit window to reset
sleep 2

# ------------------------------------------------------------------------------
# Test 3: Rate Limit on Login (5/min)
# ------------------------------------------------------------------------------
log_info "Testing rate limit on login mutation (5/min)..."

LOGIN_RATE_LIMIT_HIT=false
for i in {1..7}; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "$API_URL/graphql" \
    -H "Content-Type: application/json" \
    -d '{"query":"mutation { login(input: {email:\"test@security-test.com\", password:\"wrongpassword\"}) { accessToken } }"}' 2>/dev/null || echo "000")

  if [ "$CODE" == "429" ]; then
    if [ $i -le 5 ]; then
      log_fail "Login rate limit triggered too early (request $i)"
      LOGIN_RATE_LIMIT_HIT=true
      break
    else
      log_pass "Rate limit working on login mutation (blocked at request $i)"
      LOGIN_RATE_LIMIT_HIT=true
      break
    fi
  fi

  sleep 0.1
done

if [ "$LOGIN_RATE_LIMIT_HIT" == "false" ]; then
  log_fail "Login rate limit NOT triggered after 7 requests"
fi

# Wait for rate limit window to reset
sleep 2

# ------------------------------------------------------------------------------
# Test 4: CORS Blocking Unauthorized Origins
# ------------------------------------------------------------------------------
log_info "Testing CORS blocks unauthorized origins..."

CORS_HEADER=$(curl -s -I -X OPTIONS "$API_URL/graphql" \
  -H "Origin: https://evil-attacker-site.com" \
  -H "Access-Control-Request-Method: POST" 2>/dev/null | grep -i "access-control-allow-origin" || echo "")

if echo "$CORS_HEADER" | grep -qi "evil-attacker-site.com"; then
  log_fail "CORS allows unauthorized origin (evil-attacker-site.com)"
else
  log_pass "CORS blocking unauthorized origins"
fi

# ------------------------------------------------------------------------------
# Test 5: Security Headers Present
# ------------------------------------------------------------------------------
log_info "Testing security headers..."

HEADERS=$(curl -sI "$API_URL/health" 2>/dev/null)

# X-Content-Type-Options
if echo "$HEADERS" | grep -qi "x-content-type-options"; then
  log_pass "X-Content-Type-Options header present"
else
  log_fail "X-Content-Type-Options header missing"
fi

# X-Frame-Options
if echo "$HEADERS" | grep -qi "x-frame-options"; then
  log_pass "X-Frame-Options header present"
else
  log_fail "X-Frame-Options header missing"
fi

# X-XSS-Protection or Content-Security-Policy
if echo "$HEADERS" | grep -qi "x-xss-protection\|content-security-policy"; then
  log_pass "XSS protection header present"
else
  log_fail "XSS protection header missing (X-XSS-Protection or CSP)"
fi

# ------------------------------------------------------------------------------
# Test 6: GraphQL Introspection (should work in dev, may be disabled in prod)
# ------------------------------------------------------------------------------
log_info "Testing GraphQL introspection..."

INTROSPECTION=$(curl -s -X POST "$API_URL/graphql" \
  -H "Content-Type: application/json" \
  -d '{"query":"{ __schema { types { name } } }"}' 2>/dev/null)

if echo "$INTROSPECTION" | grep -q "__schema"; then
  log_info "GraphQL introspection is ENABLED (ok for development, consider disabling in production)"
else
  log_pass "GraphQL introspection is disabled"
fi

# ------------------------------------------------------------------------------
# Test 7: OAuth Rate Limit (10/5min)
# ------------------------------------------------------------------------------
log_info "Testing rate limit on OAuth endpoints (10/5min)..."

OAUTH_RATE_LIMIT_HIT=false
for i in {1..12}; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    "$API_URL/api/auth/twitter/authorize" 2>/dev/null || echo "000")

  # OAuth redirects to Twitter, so 302 is expected
  if [ "$CODE" == "429" ]; then
    if [ $i -le 10 ]; then
      log_fail "OAuth rate limit triggered too early (request $i of 10 allowed)"
      OAUTH_RATE_LIMIT_HIT=true
      break
    else
      log_pass "Rate limit working on OAuth endpoint (blocked at request $i)"
      OAUTH_RATE_LIMIT_HIT=true
      break
    fi
  fi

  sleep 0.1
done

if [ "$OAUTH_RATE_LIMIT_HIT" == "false" ]; then
  log_fail "OAuth rate limit NOT triggered after 12 requests"
fi

# ------------------------------------------------------------------------------
# Test 8: Generic Error Messages (no information leakage)
# ------------------------------------------------------------------------------
log_info "Testing generic error messages..."

# Test login with non-existent email
LOGIN_ERROR=$(curl -s -X POST "$API_URL/graphql" \
  -H "Content-Type: application/json" \
  -d '{"query":"mutation { login(input: {email:\"nonexistent@test.com\", password:\"wrong\"}) { accessToken } }"}' 2>/dev/null)

if echo "$LOGIN_ERROR" | grep -qi "Invalid email or password"; then
  log_pass "Login error message is generic (no email enumeration)"
elif echo "$LOGIN_ERROR" | grep -qi "email.*not.*found\|user.*not.*exist"; then
  log_fail "Login error reveals email existence"
else
  log_pass "Login error does not reveal email existence"
fi

# ==============================================================================
# SUMMARY
# ==============================================================================

echo ""
echo "============================================"
echo "Results: $PASSED passed, $FAILED failed (Total: $TOTAL)"
echo "============================================"

if [ $FAILED -gt 0 ]; then
  echo -e "${RED}Some security tests failed!${NC}"
  exit 1
else
  echo -e "${GREEN}All security tests passed!${NC}"
  exit 0
fi
