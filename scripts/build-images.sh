#!/usr/bin/env bash
# Builds a container image for the gateway, each service in infra/services.json, and the db-tools image
# (psql + EF Core migration bundles). Service images use the .NET SDK's container support
# (dotnet publish /t:PublishContainer), so they need no Dockerfile.
#
#   scripts/build-images.sh [--tag TAG] [--registry myacr.azurecr.io] [--push]
#
# Without --push, images go to the local Docker daemon as inventra/<name>:<tag>.
# With --push, they go to --registry (log in first, e.g. az acr login).
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
cd "$root"

tag=local
registry=
push=false
while [ $# -gt 0 ]; do
  case "$1" in
    --tag) tag=$2; shift 2 ;;
    --registry) registry=$2; shift 2 ;;
    --push) push=true; shift ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done
if $push && [ -z "$registry" ]; then echo "--push needs --registry." >&2; exit 2; fi

manifest=infra/services.json
gateway=$(jq -r '.gateway | "\(.name) \(.project)"' "$manifest")
mapfile -t services < <(jq -r '.services[] | "\(.name) \(.project)"' "$manifest")

publish_image() {
  local name=$1 project=$2
  local args=(
    publish "$project" -c Release --os linux --arch x64 /t:PublishContainer
    -p:ContainerRepository="inventra/$name"
    -p:ContainerImageTags="$tag"
    # Ubuntu chiseled: no shell or package manager, runs as non-root. "extra" adds ICU and time zones,
    # which globalization and TimeProvider need.
    -p:ContainerFamily=noble-chiseled-extra
    -p:ContainerImageLabels="org.opencontainers.image.revision=${GITHUB_SHA:-unknown}"
  )
  if $push; then args+=(-p:ContainerRegistry="$registry"); fi
  echo "::group::Image inventra/$name:$tag"
  dotnet "${args[@]}"
  echo "::endgroup::"
}

# shellcheck disable=SC2086 # Word splitting of "name project" is intended.
publish_image $gateway
for entry in "${services[@]}"; do
  # shellcheck disable=SC2086
  publish_image $entry
done

# db-tools: assemble the build context, then build with Docker.
echo "::group::Image inventra/db-tools:$tag"
context=artifacts/db-tools
rm -rf "$context"
mkdir -p "$context/bundles"
cp -r infra/db/Dockerfile infra/db/entrypoint.sh infra/db/sql "$context/"
dotnet tool restore >/dev/null
for entry in "${services[@]}"; do
  read -r name project <<<"$entry"
  # Framework-dependent bundle; the image provides the ASP.NET runtime.
  dotnet ef migrations bundle --project "$project" --configuration Release \
    --target-runtime linux-x64 \
    --output "$context/bundles/$name/efbundle" --force
done
db_image="inventra/db-tools:$tag"
if $push; then db_image="$registry/$db_image"; fi
docker build --pull -t "$db_image" "$context"
if $push; then docker push "$db_image"; fi
echo "::endgroup::"

echo "Built images with tag $tag."
