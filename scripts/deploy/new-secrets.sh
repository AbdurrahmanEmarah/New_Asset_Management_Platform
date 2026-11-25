#!/usr/bin/env bash
# Generates passwords for the Key Vault secrets that don't exist yet and writes them as a JSON object
# ({ "secret-name": "value" }) to the file given as $1, for main.bicep's "newSecrets" parameter.
# Existing secrets are never read or replaced. Existence is checked through Azure Resource Manager,
# which works even though the vault itself only accepts traffic from the private network.
#
#   scripts/deploy/new-secrets.sh <output.json>
# Needs: az (signed in), jq, openssl, AZURE_RESOURCE_GROUP.
set -euo pipefail

out=${1:?Usage: new-secrets.sh <output.json>}
rg=${AZURE_RESOURCE_GROUP:?AZURE_RESOURCE_GROUP is not set}
root=$(cd "$(dirname "$0")/../.." && pwd)

# The same names main.bicep uses (secretNames).
mapfile -t names < <(jq -r '"pg-admin-password", (.services[] | "pg-\(.name)-runtime-password", "pg-\(.name)-migrator-password")' "$root/infra/services.json")

vault_id=$(az keyvault list --resource-group "$rg" --query "[?tags.app=='inventra'] | [0].id" -o tsv 2>/dev/null || true)

secrets='{}'
for name in "${names[@]}"; do
  if [ -n "$vault_id" ] && az resource show --ids "$vault_id/secrets/$name" --query id -o tsv >/dev/null 2>&1; then
    continue
  fi
  # 40 letters and digits: strong, and safe inside a connection string.
  value=$(openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c 40)
  if [ -n "${GITHUB_ACTIONS:-}" ]; then echo "::add-mask::$value"; fi
  secrets=$(jq --arg k "$name" --arg v "$value" '. + {($k): $v}' <<<"$secrets")
  echo "Will create secret $name" >&2
done

umask 077
printf '%s' "$secrets" >"$out"
echo "$(jq 'length' <<<"$secrets") new secret(s)." >&2
