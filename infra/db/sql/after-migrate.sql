-- Runs as svc_<service>_migrator after the migrations.
-- Re-grants on everything that exists (covers tables created before the default privileges were set),
-- then takes write access to the migrations history away from the runtime login.
-- psql variable: runtime_role.

\set ON_ERROR_STOP on

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO :"runtime_role";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO :"runtime_role";

SELECT format('REVOKE INSERT, UPDATE, DELETE ON TABLE public.%I FROM %I', '__EFMigrationsHistory', :'runtime_role')
WHERE to_regclass('public."__EFMigrationsHistory"') IS NOT NULL \gexec
