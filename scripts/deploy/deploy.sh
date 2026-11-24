#!/usr/bin/env bash
# Deploys one environment end to end. Called by .github/workflows/deploy.yml after azure/login.
#
#   1. infra : network, data stores, registry, Key Vault, Container Apps environment, identities
#   2. images: build and push the gateway, service and db-tools images to the registry
#   3. jobs  : create or update the database jobs, then run bootstrap and each service's migrations
#   4. apps  : roll the gateway and services to the new images
#   5. smoke : the gateway's /alive answers
#
# Needs: az (signed in), dotnet, docker, jq, openssl.
# Environment: AZURE_RESOURCE_GROUP, INVENTRA_ENVIRONMENT (staging), INVENTRA_IMAGE_TAG, plus the
# INVENTRA_* values that infra/main.<environment>.bicepparam reads.
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
for _ in $(seq 1 30); do
  if curl -fsS --max-time 20 "$gateway/alive" >/dev/null; then
    echo "Gateway is up: $gateway"
    endgroup
    [ -n "${GITHUB_STEP_SUMMARY:-}" ] && echo "Deployed \`$INVENTRA_IMAGE_TAG\` to **$envname**: $gateway" >>"$GITHUB_STEP_SUMMARY"
    exit 0
  fi
  sleep 10
done
echo "::error::The gateway at $gateway did not answer /alive."
exit 1
