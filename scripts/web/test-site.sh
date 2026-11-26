#!/usr/bin/env bash
# Serves a built site with the Azure Static Web Apps emulator and checks the routing in
# infra/web/staticwebapp.config.json: deep links and the sign-in callback load index.html, missing
# assets stay 404, and the cache and security headers are set. Used by CI.
#
#   scripts/web/test-site.sh <built site folder>      e.g. web/dist/admin
set -euo pipefail

site=$(cd "${1:?Usage: test-site.sh <built site folder>}" && pwd)
port=${SWA_TEST_PORT:-4280}
swa_version=2.0.10
log=$(mktemp)
failures=0

npx --yes "@azure/static-web-apps-cli@$swa_version" start "$site" --swa-config-location "$site" --port "$port" >"$log" 2>&1 &
pid=$!
trap 'kill $pid 2>/dev/null || true; pkill -f "static-web-apps-cli" 2>/dev/null || true' EXIT
for _ in $(seq 1 90); do curl -fs -o /dev/null "http://localhost:$port/" && break; sleep 1; done

body=$(mktemp)
check_page() { # <path> <expected status> <expect index.html: yes|no>
  local code
  code=$(curl -s -o "$body" -w '%{http_code}' "http://localhost:$port$1")
  local is_index=no
  grep -q 'id="root"' "$body" && is_index=yes
  if [ "$code" = "$2" ] && [ "$is_index" = "$3" ]; then echo "  ok    $1 -> $code"; else
    echo "  FAIL  $1 -> $code (index.html: $is_index), expected $2 (index.html: $3)"; failures=$((failures + 1)); fi
}
check_header() { # <path> <header regex>
  if curl -sI "http://localhost:$port$1" | grep -qiE "$2"; then echo "  ok    $1 has $2"; else
    echo "  FAIL  $1 lacks $2"; failures=$((failures + 1)); fi
}

check_page / 200 yes
check_page '/auth/callback?code=abc&state=xyz' 200 yes
check_page /plans 200 yes
check_page /some/deep/link 200 yes
check_page /assets/does-not-exist.js 404 no
asset=$(cd "$site" && find assets -name "*.js" | sort | head -1)
check_page "/$asset" 200 no
check_header "/$asset" '^cache-control: .*immutable'
check_header /plans '^x-frame-options: DENY'
check_header / '^x-content-type-options: nosniff'

if [ "$failures" -gt 0 ]; then echo "$failures check(s) failed."; cat "$log"; exit 1; fi
echo "Static Web Apps routing checks passed."
