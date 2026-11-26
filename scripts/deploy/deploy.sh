#!/usr/bin/env bash
# Deploys one environment end to end. Called by .github/workflows/deploy.yml after azure/login.
#
#   1. infra : network, data stores, registry, Key Vault, Container Apps environment, identities
#   2. images: build and push the gateway, service and db-tools images to the registry
#   3. jobs  : create or update the database jobs, then run bootstrap and each service's migrations
#   4. apps  : roll the gateway and services to the new images
#   5. smoke : the gateway's /alive answers
#   6. web   : build each web app with its VITE_* settings and upload it to its Static Web App
#
# Needs: az (signed in), dotnet, docker, jq, openssl, node/npm.
# Environment: AZURE_RESOURCE_GROUP, INVENTRA_ENVIRONMENT (staging), INVENTRA_IMAGE_TAG, plus the
# INVENTRA_* values that infra/main.<environment>.bicepparam reads. Web apps also use
# INVENTRA_WEB_<APP>_CLIENT_ID (required to deploy that app), INVENTRA_WEB_<APP>_SCOPE (optional) and
# INVENTRA_API_URL (optional; defaults to the gateway's address).
set -euo pipefail

root=$(cd "$(dirname "$0")/../.." && pwd)
cd "$root"

rg=${AZURE_RESOURCE_GROUP:?AZURE_RESOURCE_GROUP is not set}
envname=${INVENTRA_ENVIRONMENT:-staging}
: "${INVENTRA_IMAGE_TAG:?INVENTRA_IMAGE_TAG is not set}"
params="infra/main.$envname.bicepparam"
[ -f "$params" ] || { echo "No parameters file $params." >&2; exit 1; }
work=${RUNNER_TEMP:-$(mktemp -d)}

group() { echo "::group::$1"; }
endgroup() { echo "::endgroup::"; }

# deploy_stage <name> <deployJobs> <deployApps> → writes outputs to $work/outputs.json
deploy_stage() {
  group "Deploy stage: $1"
  INVENTRA_DEPLOY_JOBS=$2 INVENTRA_DEPLOY_APPS=$3 az deployment group create \
    --resource-group "$rg" --name "inventra-$envname-$1" \
    --parameters "$params" \
    --query properties.outputs -o json >"$work/outputs.json"
  endgroup
}
output() { jq -r ".$1.value" "$work/outputs.json"; }

# run_job <job name>: starts a manual job and waits for it to finish.
run_job() {
  local job=$1 execution status
  execution=$(az containerapp job start --resource-group "$rg" --name "$job" --query name -o tsv)
  echo "Started $job ($execution)"
  for _ in $(seq 1 90); do
    status=$(az containerapp job execution show --resource-group "$rg" --name "$job" \
      --job-execution-name "$execution" --query properties.status -o tsv)
    case "$status" in
      Succeeded) echo "$job succeeded."; return 0 ;;
      Failed | Stopped | Degraded)
        echo "::error::$job ended as $status. Its logs are in Log Analytics: ContainerAppConsoleLogs_CL | where ContainerJobName_s == '$job'"
        return 1 ;;
    esac
    sleep 10
  done
  echo "::error::$job did not finish within 15 minutes."
  return 1
}

az extension add --name containerapp --upgrade --yes --only-show-errors

# 1. Infrastructure, with passwords for any secret that doesn't exist yet.
scripts/deploy/new-secrets.sh "$work/new-secrets.json"
INVENTRA_NEW_SECRETS=$(cat "$work/new-secrets.json") deploy_stage infra false false
rm -f "$work/new-secrets.json"

# 2. Images.
registry=$(output registryName)
login_server=$(output registryLoginServer)
group "Build and push images ($INVENTRA_IMAGE_TAG)"
az acr login --name "$registry"
scripts/build-images.sh --registry "$login_server" --tag "$INVENTRA_IMAGE_TAG" --push
endgroup

# 3. Database jobs.
deploy_stage jobs true false
group "Database bootstrap and migrations"
run_job "$(output bootstrapJobName)"
for job in $(jq -r '.migrateJobNames.value[]' "$work/outputs.json"); do
  run_job "$job"
done
endgroup

# 4. Apps.
deploy_stage apps true true
gateway=$(output gatewayUrl)

# 5. Smoke test. Staging scales to zero, so the first request may take a little while.
group "Smoke test $gateway"
up=false
for _ in $(seq 1 30); do
  if curl -fsS --max-time 20 "$gateway/alive" >/dev/null; then up=true; break; fi
  sleep 10
done
endgroup
if ! $up; then echo "::error::The gateway at $gateway did not answer /alive."; exit 1; fi
echo "Gateway is up: $gateway"
summary=("Deployed \`$INVENTRA_IMAGE_TAG\` to **$envname**." "- Gateway: $gateway")

# 6. Web apps. Settings are baked into the JavaScript at build time; none of them is secret.
swa_version=2.0.10
api_url=${INVENTRA_API_URL:-$gateway}
while read -r app site url; do
  key=$(printf '%s' "$app" | tr 'a-z-' 'A-Z_')
  client_var="INVENTRA_WEB_${key}_CLIENT_ID"
  scope_var="INVENTRA_WEB_${key}_SCOPE"
  realm=$(jq -r --arg a "$app" '.webApps[] | select(.name == $a) | .realm' infra/services.json)
  if [ "$realm" = tenant ]; then authority=${INVENTRA_TENANT_AUTHORITY:-}; else authority=${INVENTRA_PLATFORM_AUTHORITY:-}; fi
  if [ -z "${!client_var:-}" ] || [ -z "$authority" ]; then
    echo "::notice::Web app '$app' not deployed: set $client_var and the $realm sign-in authority to deploy it."
    continue
  fi
  group "Web app $app -> $url"
  status=0
  dir=$(VITE_API_URL=$api_url VITE_OIDC_AUTHORITY=$authority VITE_OIDC_CLIENT_ID=${!client_var} \
        VITE_OIDC_SCOPE=${!scope_var:-} scripts/web/build-site.sh "$app" | tail -1) || status=$?
  if [ "$status" -eq 3 ]; then echo "::notice::Web app '$app' isn't in web/ yet; skipped."; endgroup; continue; fi
  [ "$status" -eq 0 ] || exit "$status"
  # The deployment token is read through ARM for this run only and passed in the environment.
  token=$(az staticwebapp secrets list --resource-group "$rg" --name "$site" --query properties.apiKey -o tsv)
  echo "::add-mask::$token"
  SWA_CLI_DEPLOYMENT_TOKEN=$token npx --yes "@azure/static-web-apps-cli@$swa_version" deploy "$dir" \
    --swa-config-location "$dir" --env production
  unset token
  endgroup
  summary+=("- Web app $app: $url")
done < <(jq -r '.webApps.value[] | "\(.name) \(.siteName) \(.url)"' "$work/outputs.json")

if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then printf '%s\n' "${summary[@]}" >>"$GITHUB_STEP_SUMMARY"; fi
printf '%s\n' "${summary[@]}"
