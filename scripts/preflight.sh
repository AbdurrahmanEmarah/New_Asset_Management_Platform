#!/usr/bin/env bash
# Checks that Azure and GitHub are set up for the deploy workflow (.github/workflows/deploy.yml).
# Prints "Ready to deploy" or exactly what is missing and how to fix it. Changes nothing.
#
#   scripts/preflight.sh [--repo owner/name] [--environment staging]
# Needs the Azure CLI (az login) and the GitHub CLI (gh auth login). Run it from the repository folder.
# The Windows PowerShell version is scripts/preflight.ps1; keep the two in step.
set -uo pipefail

repo=
envname=staging
while [ $# -gt 0 ]; do
  case "$1" in
    --repo) repo=$2; shift 2 ;;
    --environment) envname=$2; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

problems=()
ok() { printf '  [ok]      %s\n' "$1"; }
missing() { printf '  [missing] %s\n            -> %s\n' "$1" "$2"; problems+=("$1"); }
section() { printf '\n%s\n' "$1"; }

providers=(Microsoft.App Microsoft.ContainerRegistry Microsoft.DBforPostgreSQL Microsoft.KeyVault
  Microsoft.ManagedIdentity Microsoft.Network Microsoft.OperationalInsights Microsoft.Insights
  Microsoft.ServiceBus Microsoft.Storage)
required_vars=(AZURE_CLIENT_ID AZURE_TENANT_ID AZURE_SUBSCRIPTION_ID AZURE_RESOURCE_GROUP AZURE_LOCATION
  INVENTRA_NAME_PREFIX INVENTRA_PLATFORM_AUTHORITY)
declare -A vars=()

# ── GitHub ──────────────────────────────────────────────────────────────────────────────────────────
section "GitHub"
if ! command -v gh >/dev/null; then
  missing "GitHub CLI (gh)" "Install it from https://cli.github.com, then run: gh auth login"
elif ! gh auth status >/dev/null 2>&1; then
  missing "Signed in to the GitHub CLI" "Run: gh auth login"
else
  ok "GitHub CLI signed in"
  [ -n "$repo" ] || repo=$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || true)
  if [ -z "$repo" ]; then
    missing "Repository" "Run this from the repository folder, or pass --repo owner/name"
  else
    ok "Repository $repo"
    while IFS=$'\t' read -r name value; do vars[$name]=$value; done \
      < <(gh variable list --repo "$repo" --json name,value -q '.[] | [.name, .value] | @tsv' 2>/dev/null)
    for name in "${required_vars[@]}"; do
      if [ -n "${vars[$name]:-}" ]; then ok "Variable $name = ${vars[$name]}"
      else missing "Repository variable $name" "gh variable set $name --repo $repo --body \"<value>\"  (docs/deployment/azure-setup.md)"; fi
    done
    if gh api "repos/$repo/environments/$envname" >/dev/null 2>&1; then ok "Environment '$envname'"
    else missing "GitHub environment '$envname'" "gh api -X PUT repos/$repo/environments/$envname"; fi
    if [ "${vars[DEPLOY_ENABLED]:-}" = "true" ]; then ok "DEPLOY_ENABLED is true (deployments run after CI on main)"
    else printf '  [info]    DEPLOY_ENABLED is not "true", so the deploy workflow stays switched off.\n'; fi
  fi
fi

# ── Sign-in issuer ──────────────────────────────────────────────────────────────────────────────────
authority=${vars[INVENTRA_PLATFORM_AUTHORITY]:-}
if [ -n "$authority" ]; then
  section "Sign-in"
  if curl -fsS --max-time 15 "${authority%/}/.well-known/openid-configuration" >/dev/null 2>&1; then
    ok "Platform issuer answers: $authority"
  else
    missing "Platform issuer metadata at ${authority%/}/.well-known/openid-configuration" "Check INVENTRA_PLATFORM_AUTHORITY: it must be the issuer URL of the Entra External ID tenant"
  fi
fi

# ── Azure ───────────────────────────────────────────────────────────────────────────────────────────
section "Azure"
subscription=${vars[AZURE_SUBSCRIPTION_ID]:-}
rg=${vars[AZURE_RESOURCE_GROUP]:-}
location=${vars[AZURE_LOCATION]:-}
client_id=${vars[AZURE_CLIENT_ID]:-}
tenant=${vars[AZURE_TENANT_ID]:-}

if ! command -v az >/dev/null; then
  missing "Azure CLI (az)" "Install it from https://aka.ms/installazurecli, then run: az login"
elif ! az account show >/dev/null 2>&1; then
  missing "Signed in to the Azure CLI" "Run: az login"
elif [ -z "$subscription" ]; then
  missing "Subscription to check" "Set the AZURE_SUBSCRIPTION_ID repository variable first"
else
  state=$(az account show --subscription "$subscription" --query state -o tsv 2>/dev/null)
  if [ "$state" != "Enabled" ]; then
    missing "Subscription $subscription (state: ${state:-not found})" "Check the ID, or run: az login --tenant $tenant"
  else
    ok "Subscription $subscription is enabled"
    actual_tenant=$(az account show --subscription "$subscription" --query tenantId -o tsv)
    if [ -n "$tenant" ] && [ "$actual_tenant" != "$tenant" ]; then
      missing "AZURE_TENANT_ID matches the subscription" "Set AZURE_TENANT_ID to $actual_tenant"
    fi

    registered=$(az provider list --subscription "$subscription" --query "[?registrationState=='Registered'].namespace" -o tsv)
    for p in "${providers[@]}"; do
      if grep -qix "$p" <<<"$registered"; then ok "Provider $p registered"
      else missing "Resource provider $p" "az provider register --namespace $p --subscription $subscription"; fi
    done

    rg_id=
    if [ -n "$rg" ]; then
      rg_location=$(az group show --subscription "$subscription" -n "$rg" --query location -o tsv 2>/dev/null)
      if [ -z "$rg_location" ]; then
        missing "Resource group $rg" "az group create --name $rg --location ${location:-<region>} --subscription $subscription"
      else
        ok "Resource group $rg ($rg_location)"
        rg_id=$(az group show --subscription "$subscription" -n "$rg" --query id -o tsv)
        if [ -n "$location" ] && [ "$rg_location" != "$location" ]; then
          missing "AZURE_LOCATION ($location) matches the resource group's region ($rg_location)" "Set AZURE_LOCATION to $rg_location"
        fi
      fi
    fi

    if [ -n "$client_id" ]; then
      identity=$(az identity list --subscription "$subscription" --query "[?clientId=='$client_id'] | [0].[name, resourceGroup, principalId]" -o tsv 2>/dev/null)
      if [ -z "$identity" ]; then
        missing "Deploy identity with client ID $client_id" "Create it as in docs/deployment/azure-setup.md, step 4"
      else
        read -r id_name id_rg principal <<<"$identity"
        ok "Deploy identity $id_name"
        subject="repo:$repo:environment:$envname"
        found=$(az identity federated-credential list --subscription "$subscription" --identity-name "$id_name" -g "$id_rg" \
          --query "[?subject=='$subject' && issuer=='https://token.actions.githubusercontent.com'] | length(@)" -o tsv 2>/dev/null)
        if [ "${found:-0}" -ge 1 ]; then ok "Federated credential for $subject"
        else missing "Federated credential for $subject" "az identity federated-credential create --identity-name $id_name -g $id_rg --name github-$envname --issuer https://token.actions.githubusercontent.com --subject $subject --audiences api://AzureADTokenExchange"; fi

        if [ -n "$rg_id" ]; then
          roles=$(az role assignment list --subscription "$subscription" --assignee "$principal" --scope "$rg_id" --include-inherited --query "[].roleDefinitionName" -o tsv 2>/dev/null)
          if grep -qxE "Contributor|Owner" <<<"$roles"; then ok "Deploy identity can create resources in $rg"
          else missing "Contributor role for the deploy identity on $rg" "az role assignment create --assignee-object-id $principal --assignee-principal-type ServicePrincipal --role Contributor --scope $rg_id"; fi
          if grep -qxE "Role Based Access Control Administrator|User Access Administrator|Owner" <<<"$roles"; then ok "Deploy identity can grant the apps their roles"
          else missing "Role Based Access Control Administrator role for the deploy identity on $rg" "See docs/deployment/azure-setup.md, step 5 (limited to the roles the apps need)"; fi
        fi
      fi
    fi
  fi
fi

echo
if [ ${#problems[@]} -eq 0 ]; then
  echo "Ready to deploy"
  [ "${vars[DEPLOY_ENABLED]:-}" = "true" ] || echo "(Switch it on with: gh variable set DEPLOY_ENABLED --repo $repo --body true)"
  exit 0
fi
echo "Not ready: ${#problems[@]} thing(s) missing:"
printf '  - %s\n' "${problems[@]}"
exit 1
