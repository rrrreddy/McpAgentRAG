#!/bin/bash
# Creates the app's two Postgres identities as plain, non-superuser LOGIN
# roles (see README.md in this directory for why that's load-bearing for
# Row-Level Security), and enables pgvector. Runs once, automatically, via
# docker-entrypoint-initdb.d as the bootstrap superuser.
set -euo pipefail

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    DO \$\$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${RAGMCP_APP_USER}') THEN
            CREATE ROLE ${RAGMCP_APP_USER} LOGIN PASSWORD '${RAGMCP_APP_PASSWORD}';
        END IF;
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${RAGMCP_READONLY_USER}') THEN
            CREATE ROLE ${RAGMCP_READONLY_USER} LOGIN PASSWORD '${RAGMCP_READONLY_PASSWORD}';
        END IF;
    END
    \$\$;

    -- ragmcp_app owns the app schema and the datahub schema/tables/views.
    -- It is a normal role: no SUPERUSER, no BYPASSRLS, ever.
    GRANT ALL PRIVILEGES ON DATABASE ${POSTGRES_DB} TO ${RAGMCP_APP_USER};
    ALTER DATABASE ${POSTGRES_DB} OWNER TO ${RAGMCP_APP_USER};

    -- ragmcp_readonly can log in and reach the database, but starts with
    -- zero grants — every grant it gets is explicit, in 02-datahub-schema.sql,
    -- and scoped to masked views only, never base tables.
    GRANT CONNECT ON DATABASE ${POSTGRES_DB} TO ${RAGMCP_READONLY_USER};

    CREATE EXTENSION IF NOT EXISTS vector;
EOSQL
