# db-tools: psql plus each service's EF Core migrations bundle. Used by the Container Apps jobs that
# bootstrap database logins and run migrations inside the VNet (PostgreSQL has no public endpoint).
# Build it with scripts/build-images.sh, which assembles the build context in artifacts/db-tools
# (this folder plus a bundles/<service>/efbundle per service).
#
# The ASP.NET runtime image is needed because the bundles load the services' assemblies.
FROM mcr.microsoft.com/dotnet/aspnet:10.0

RUN apt-get update \
 && apt-get install -y --no-install-recommends postgresql-client \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY entrypoint.sh /app/entrypoint.sh
COPY sql /app/sql
COPY bundles /app/bundles

# The non-root user that .NET images ship with.
USER app
ENTRYPOINT ["/app/entrypoint.sh"]
