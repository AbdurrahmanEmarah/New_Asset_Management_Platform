#!/usr/bin/env bash
# End-to-end check of the database logins plan (docs/deployment/database-logins.md) against a real
# PostgreSQL, using the images from scripts/build-images.sh. Used by CI; also runs locally.
#
# It recreates Azure's situation: the admin has CREATEROLE and CREATEDB but is NOT a superuser, and the
# service databases are owned by a group role the admin belongs to (azure_pg_admin on Azure).
# Then it runs the real db-tools image (bootstrap, migrate) and each service image as svc_<service>,
# and checks that every login can do what it needs and nothing more.
#
#   scripts/db/test-least-privilege.sh [tag]      (default tag: local)
# Needs a PostgreSQL superuser on localhost:5432 (postgres/postgres, as in CI), Docker, psql and jq.
set -euo pipefail

tag=${1:-local}
root=$(cd "$(dirname "$0")/../.." && pwd)
manifest="$root/infra/services.json"

export PGHOST=${PGHOST:-localhost} PGPORT=${PGPORT:-5432}
super_user=${PG_SUPERUSER:-postgres}
super_password=${PG_SUPERUSER_PASSWORD:-postgres}
admin=inventra_admin
admin_password=admin-$RANDOM-$RANDOM
failures=0

as_super() { PGUSER=$super_user PGPASSWORD=$super_password psql --no-psqlrc -qtAX -v ON_ERROR_STOP=1 "$@"; }
pass() { echo "  ok    $1"; }
fail() { echo "  FAIL  $1"; failures=$((failures + 1)); }
# expect_ok/expect_denied <description> <user> <password> <database> <sql>
# try_sql <user> <password> <database> <sql>
try_sql() { PGUSER=$1 PGPASSWORD=$2 psql --no-psqlrc -qtAX -v ON_ERROR_STOP=1 -d "$3" -c "$4" >/dev/null 2>&1; }
expect_ok() { if try_sql "$2" "$3" "$4" "$5"; then pass "$1"; else fail "$1"; fi; }
expect_denied() { if try_sql "$2" "$3" "$4" "$5"; then fail "$1 (was allowed)"; else pass "$1"; fi; }

mapfile -t entries < <(jq -r '.services[] | "\(.name) \(.database)"' "$manifest")

echo "Setting up an Azure-like server"
as_super -d postgres <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'azure_pg_admin') THEN CREATE ROLE azure_pg_admin NOLOGIN; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$admin') THEN CREATE ROLE $admin LOGIN; END IF;
END \$\$;
ALTER ROLE $admin WITH LOGIN NOSUPERUSER CREATEROLE CREATEDB PASSWORD '$admin_password';
GRANT azure_pg_admin TO $admin;
SQL
for entry in "${entries[@]}"; do
  read -r service database <<<"$entry"
  as_super -d postgres -c "DROP DATABASE IF EXISTS $database WITH (FORCE)" -c "CREATE DATABASE $database OWNER azure_pg_admin"
  for role in "svc_${service//-/_}" "svc_${service//-/_}_migrator"; do
    as_super -d postgres -c "DROP ROLE IF EXISTS $role"
  done
done

db_tools() {
  docker run --rm --network host -e PGHOST -e PGPORT -e PGSSLMODE=disable -e NPGSQL_SSL_MODE=Disable "$@"
}

databases=$(jq -r '[.services[] | "\(.name)=\(.database)"] | join(" ")' "$manifest")
bootstrap_env=(-e INVENTRA_DATABASES="$databases" -e PGDATABASE=postgres -e PGUSER="$admin" -e PGPASSWORD="$admin_password")
declare -A runtime_pw migrator_pw
for entry in "${entries[@]}"; do
  read -r service _ <<<"$entry"
  key=$(printf '%s' "$service" | tr 'a-z-' 'A-Z_')
  runtime_pw[$service]=rt-$RANDOM-$RANDOM
  migrator_pw[$service]=mg-$RANDOM-$RANDOM
  bootstrap_env+=(-e "PG_${key}_RUNTIME_PASSWORD=${runtime_pw[$service]}" -e "PG_${key}_MIGRATOR_PASSWORD=${migrator_pw[$service]}")
done

echo "Bootstrap (twice, to prove it is repeatable)"
db_tools "${bootstrap_env[@]}" "inventra/db-tools:$tag" bootstrap
db_tools "${bootstrap_env[@]}" "inventra/db-tools:$tag" bootstrap

as_super -d postgres -c "DROP ROLE IF EXISTS intruder" -c "CREATE ROLE intruder LOGIN PASSWORD 'intruder'"

port=18100
for entry in "${entries[@]}"; do
  read -r service database <<<"$entry"
  runtime="svc_${service//-/_}"
  migrator="${runtime}_migrator"
  echo "Service $service"

  echo "Migrate (twice)"
  for _ in 1 2; do
    db_tools -e PGDATABASE="$database" -e PGUSER="$migrator" -e PGPASSWORD="${migrator_pw[$service]}" \
      "inventra/db-tools:$tag" migrate "$service"
  done

  table=$(as_super -d "$database" -c "SELECT quote_ident(tablename) FROM pg_tables WHERE schemaname = 'public' AND tablename <> '__EFMigrationsHistory' ORDER BY tablename LIMIT 1")
  owner=$(as_super -d "$database" -c "SELECT tableowner FROM pg_tables WHERE schemaname = 'public' AND tablename = '${table//\"/}'")
  if [ "$owner" = "$migrator" ]; then pass "tables are owned by $migrator"; else fail "table $table is owned by '$owner', not $migrator"; fi

  col=$(as_super -d "$database" -c "SELECT quote_ident(column_name) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '${table//\"/}' AND is_identity = 'NO' ORDER BY ordinal_position LIMIT 1")
  rpw=${runtime_pw[$service]}
  expect_ok     "$runtime can read $table"                        "$runtime" "$rpw" "$database" "SELECT count(*) FROM $table"
  expect_ok     "$runtime can insert, update and delete rows"     "$runtime" "$rpw" "$database" "BEGIN; INSERT INTO $table OVERRIDING SYSTEM VALUE SELECT * FROM $table WHERE false; UPDATE $table SET $col = $col WHERE false; DELETE FROM $table WHERE false; ROLLBACK"
  expect_denied "$runtime cannot create tables"                   "$runtime" "$rpw" "$database" "CREATE TABLE sneaky (id int)"
  expect_denied "$runtime cannot drop $table"                     "$runtime" "$rpw" "$database" "DROP TABLE $table"
  expect_denied "$runtime cannot alter $table"                    "$runtime" "$rpw" "$database" "ALTER TABLE $table ADD COLUMN sneaky int"
  expect_denied "$runtime cannot truncate $table"                 "$runtime" "$rpw" "$database" "TRUNCATE $table"
  expect_denied "$runtime cannot write the migrations history"    "$runtime" "$rpw" "$database" "DELETE FROM \"__EFMigrationsHistory\""
  expect_denied "$runtime cannot create schemas"                  "$runtime" "$rpw" "$database" "CREATE SCHEMA sneaky"
  expect_denied "$runtime cannot create roles"                    "$runtime" "$rpw" "postgres" "CREATE ROLE sneaky"
  expect_denied "another login cannot connect to $database"       intruder intruder "$database" "SELECT 1"
  expect_denied "$migrator cannot create roles"                   "$migrator" "${migrator_pw[$service]}" "$database" "CREATE ROLE sneaky"

  # Wolverine's outbox and inbox come from the migrations; the runtime login only uses their rows.
  wolverine_owner=$(as_super -d "$database" -c "SELECT tableowner FROM pg_tables WHERE schemaname = 'wolverine' AND tablename = 'wolverine_incoming_envelopes'")
  if [ "$wolverine_owner" = "$migrator" ]; then pass "the wolverine tables exist and are owned by $migrator"; else fail "wolverine.wolverine_incoming_envelopes is owned by '${wolverine_owner:-nobody (missing)}', not $migrator"; fi
  expect_ok     "$runtime can use the outbox and inbox rows"      "$runtime" "$rpw" "$database" "BEGIN; SELECT count(*) FROM wolverine.wolverine_incoming_envelopes; DELETE FROM wolverine.wolverine_outgoing_envelopes WHERE false; UPDATE wolverine.wolverine_nodes SET id = id WHERE false; SELECT nextval('wolverine.wolverine_node_records_id_seq'); ROLLBACK"
  expect_denied "$runtime cannot create tables in wolverine"      "$runtime" "$rpw" "$database" "CREATE TABLE wolverine.sneaky (id int)"
  expect_denied "$runtime cannot drop wolverine tables"           "$runtime" "$rpw" "$database" "DROP TABLE wolverine.wolverine_dead_letters"

  echo "Service image signed in as $runtime"
  name="lp-test-$service"
  docker rm -f "$name" >/dev/null 2>&1 || true
  docker run -d --name "$name" --network host \
    -e ASPNETCORE_HTTP_PORTS=$port \
    -e "ConnectionStrings__${database}=Host=$PGHOST;Port=$PGPORT;Database=$database;Username=$runtime;Password=$rpw" \
    -e Auth__Platform__Authority=https://login.invalid/realms/inventra-platform \
    "inventra/$service:$tag" >/dev/null
  health=
  for _ in $(seq 1 30); do
    health=$(curl -fsS "http://localhost:$port/health" 2>/dev/null || true)
    [ "$health" = "Healthy" ] && break
    sleep 1
  done
  if [ "$health" = "Healthy" ]; then pass "$service /health is Healthy with the runtime login"; else
    fail "$service /health returned '${health:-nothing}'"; docker logs "$name" | tail -20
  fi
  docker rm -f "$name" >/dev/null
  port=$((port + 1))
done

as_super -d postgres -c "DROP ROLE IF EXISTS intruder"

if [ "$failures" -gt 0 ]; then echo "$failures check(s) failed."; exit 1; fi
echo "All least-privilege checks passed."
