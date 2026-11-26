#!/usr/bin/env bash
# Checks that infra/services.json matches the code, so Azure gets every service and every Service Bus
# subscription it needs:
#   - every service project under src/Services is listed, and every listed project exists;
#   - "name" and "subscribesTo" equal the AddInventraMessaging(...) call in the service's Program.cs.
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
manifest="$root/infra/services.json"
failures=0
fail() { echo "  FAIL  $1"; failures=$((failures + 1)); }

listed=$(jq -r '.services[].project' "$manifest" | sort)
found=$(cd "$root" && git ls-files 'src/Services/*/*/*.csproj' | grep -v '\.Tests/' | sort)
while read -r p; do [ -z "$p" ] || grep -qxF "$p" <<<"$listed" || fail "$p is not in infra/services.json"; done <<<"$found"
while read -r p; do [ -f "$root/$p" ] || fail "infra/services.json lists $p, which doesn't exist"; done <<<"$listed"

while read -r name project expected; do
  program="$root/$(dirname "$project")/Program.cs"
  # The call may span lines: join the file, then take name and subscribesTo from the first call.
  call=$(tr '\n' ' ' <"$program" | grep -oE 'AddInventraMessaging\([^;]*\);' | head -1 || true)
  if [ -z "$call" ]; then
    [ "$expected" = "[]" ] || fail "$name: no AddInventraMessaging call in $program, but subscribesTo is $expected"
    continue
  fi
  code_name=$(grep -oE 'AddInventraMessaging\(\s*"[^"]+"' <<<"$call" | grep -oE '"[^"]+"' | tr -d '"')
  code_subs=$({ grep -oE 'subscribesTo:\s*\[[^]]*\]' <<<"$call" || true; } | { grep -oE '"[^"]+"' || true; } | tr -d '"' | sort | paste -sd, -)
  want_subs=$(jq -r '.[]' <<<"$expected" | sort | paste -sd, -)
  [ "$code_name" = "$name" ] || fail "$name: Program.cs publishes as '$code_name'"
  if [ "$code_subs" = "$want_subs" ]; then echo "  ok    $name subscribes to [${code_subs}]"
  else fail "$name: Program.cs subscribes to [$code_subs], infra/services.json says [$want_subs]"; fi
done < <(jq -r '.services[] | "\(.name) \(.project) \(.subscribesTo // [] | tojson)"' "$manifest")

if [ "$failures" -gt 0 ]; then echo "$failures problem(s) in infra/services.json."; exit 1; fi
echo "infra/services.json matches the code."
