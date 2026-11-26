#!/bin/sh
# Entry point of the db-tools image. Connection details come from the standard PG* environment variables
# (PGHOST, PGDATABASE, PGUSER, PGPASSWORD, PGSSLMODE); passwords never appear on a command line.
#
#   bootstrap              As the admin: create or update every service's logins and database grants.
#                          Needs INVENTRA_DATABASES="service=database ..." and, per service,
#                          PG_<SERVICE>_RUNTIME_PASSWORD and PG_<SERVICE>_MIGRATOR_PASSWORD.
#   migrate <service>      As svc_<service>_migrator: apply that service's EF Core migrations.
set -eu

sql=/app/sql
role_name() { printf 'svc_%s' "$(printf '%s' "$1" | tr '-' '_')"; }
env_key() { printf '%s' "$1" | tr 'a-z-' 'A-Z_'; }

case "${1:-}" in
  bootstrap)
    : "${INVENTRA_DATABASES:?INVENTRA_DATABASES is not set}"
    for pair in $INVENTRA_DATABASES; do
      service=${pair%%=*}
      database=${pair#*=}
      key=$(env_key "$service")
      runtime_password=$(printenv "PG_${key}_RUNTIME_PASSWORD" || true)
      migrator_password=$(printenv "PG_${key}_MIGRATOR_PASSWORD" || true)
      if [ -z "$runtime_password" ] || [ -z "$migrator_password" ]; then
        echo "Missing PG_${key}_RUNTIME_PASSWORD or PG_${key}_MIGRATOR_PASSWORD for $service." >&2
        exit 1
      fi
      echo "Bootstrapping logins for $service (database $database)"
      PG_RUNTIME_PASSWORD=$runtime_password PG_MIGRATOR_PASSWORD=$migrator_password \
        psql --no-psqlrc --quiet --dbname="${PGDATABASE:-postgres}" \
          -v dbname="$database" \
          -v runtime_role="$(role_name "$service")" \
          -v migrator_role="$(role_name "$service")_migrator" \
          -v runtime_limit="${INVENTRA_RUNTIME_CONNECTION_LIMIT:-25}" \
          -v migrator_limit="${INVENTRA_MIGRATOR_CONNECTION_LIMIT:-3}" \
          -f "$sql/bootstrap-service.sql"
    done
    echo "Bootstrap finished."
    ;;
  migrate)
    service=${2:?Usage: migrate <service>}
    bundle="/app/bundles/$service/efbundle"
    [ -x "$bundle" ] || { echo "No migrations bundle for '$service'." >&2; exit 1; }
    runtime_role=$(role_name "$service")
    echo "Migrating $service as ${PGUSER:?PGUSER is not set}"
    psql --no-psqlrc --quiet -v runtime_role="$runtime_role" -f "$sql/before-migrate.sql"
    # Npgsql reads PGPASSWORD itself, so the password stays out of the connection string.
    "$bundle" --connection "Host=${PGHOST:?};Port=${PGPORT:-5432};Database=${PGDATABASE:?};Username=$PGUSER;SSL Mode=${NPGSQL_SSL_MODE:-Require}"
    psql --no-psqlrc --quiet -v runtime_role="$runtime_role" -f "$sql/after-migrate.sql"
    echo "Migrations for $service finished."
    ;;
  *)
    echo "Usage: entrypoint.sh bootstrap | migrate <service>" >&2
    exit 2
    ;;
esac
