-- Creates (or updates) one service's two logins and their database-level access.
-- Runs as the PostgreSQL admin, which on Azure has CREATEROLE but is not a superuser, so this script
-- uses nothing that needs a superuser. It is safe to run on every deployment.
--
--   svc_<service>_migrator  Owns the service's tables. Used only by the migration job.
--   svc_<service>           What the running service signs in as: read and write rows, nothing else.
--                           It owns no tables, so row-level security policies apply to it.
--
-- psql variables: dbname, runtime_role, migrator_role, runtime_limit, migrator_limit.
-- Passwords come from environment variables, so they never appear on a command line.

\set ON_ERROR_STOP on
\getenv runtime_password PG_RUNTIME_PASSWORD
\getenv migrator_password PG_MIGRATOR_PASSWORD

SELECT format('CREATE ROLE %I LOGIN', :'migrator_role')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'migrator_role') \gexec

SELECT format('CREATE ROLE %I LOGIN', :'runtime_role')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'runtime_role') \gexec

-- Setting the password every run keeps PostgreSQL in step with Key Vault after a rotation.
ALTER ROLE :"migrator_role" WITH LOGIN PASSWORD :'migrator_password' CONNECTION LIMIT :migrator_limit;
ALTER ROLE :"runtime_role" WITH LOGIN PASSWORD :'runtime_password' CONNECTION LIMIT :runtime_limit;

-- Only this service's logins may connect to its database.
REVOKE ALL ON DATABASE :"dbname" FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE :"dbname" TO :"runtime_role";
GRANT CONNECT, TEMPORARY, CREATE ON DATABASE :"dbname" TO :"migrator_role";

\connect :"dbname"

-- The migrator creates tables in the public schema; the runtime login may only use them.
GRANT USAGE, CREATE ON SCHEMA public TO :"migrator_role";
GRANT USAGE ON SCHEMA public TO :"runtime_role";
