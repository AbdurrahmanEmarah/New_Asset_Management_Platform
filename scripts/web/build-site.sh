#!/usr/bin/env bash
# Builds one web app (an entry of "webApps" in infra/services.json) for Azure Static Web Apps:
# runs the Vite build with the VITE_* settings baked in, then adds infra/web/staticwebapp.config.json
# (SPA fallback so deep links and /auth/callback load index.html, caching and security headers).
#
#   scripts/web/build-site.sh <app>            e.g. admin
# Environment (all baked into the JavaScript, so none of them may be secret):
#   VITE_API_URL          the gateway's address, e.g. https://inventra-stg-gateway.<...>.azurecontainerapps.io
#   VITE_OIDC_AUTHORITY   the sign-in issuer for this app's realm
#   VITE_OIDC_CLIENT_ID   this app's client (application) ID
#   VITE_OIDC_SCOPE       optional: the scopes to request, e.g. "openid profile email api://<api id>/access"
# Prints the output folder on the last line. Exits 3 when the app doesn't exist in web/ yet.
set -euo pipefail

app=${1:?Usage: build-site.sh <app>}
root=$(cd "$(dirname "$0")/../.." && pwd)
entry=$(jq -c --arg a "$app" '.webApps[] | select(.name == $a)' "$root/infra/services.json")
[ -n "$entry" ] || { echo "No web app '$app' in infra/services.json." >&2; exit 2; }
config=$(jq -r .viteConfig <<<"$entry")
out="$root/web/$(jq -r .outDir <<<"$entry")"

if [ ! -f "$root/web/$config" ]; then
  echo "Web app '$app' has no web/$config yet; skipping." >&2
  exit 3
fi
missing=()
for name in VITE_API_URL VITE_OIDC_AUTHORITY VITE_OIDC_CLIENT_ID; do
  [ -n "${!name:-}" ] || missing+=("$name")
done
if [ ${#missing[@]} -gt 0 ]; then echo "Missing settings for '$app': ${missing[*]}" >&2; exit 1; fi

cd "$root/web"
[ -d node_modules ] || npm ci --no-audit --no-fund >&2
npx vite build --config "$config" >&2
cp "$root/infra/web/staticwebapp.config.json" "$out/staticwebapp.config.json"
[ -f "$out/index.html" ] || { echo "The build of '$app' produced no index.html in $out." >&2; exit 1; }
echo "$out"
