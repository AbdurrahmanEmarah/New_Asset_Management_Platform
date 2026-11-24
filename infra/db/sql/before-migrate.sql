-- Runs as svc_<service>_migrator before the migrations.
-- Every table and sequence the migrator creates from now on is usable by the runtime login.
-- (A role may always set default privileges for its own objects, so this needs no admin rights.)
-- psql variable: runtime_role.

\set ON_ERROR_STOP on

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"runtime_role";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO :"runtime_role";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO :"runtime_role";
