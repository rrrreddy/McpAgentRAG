# Postgres bootstrap scripts

These run once, automatically, the first time the `postgres` container
initializes an empty data volume (standard `docker-entrypoint-initdb.d`
behavior of the official `postgres` image), in filename order:

1. `01-create-roles-and-extensions.sh` — creates the two application
   roles (`ragmcp_app`, `ragmcp_readonly`) as **plain, non-superuser LOGIN
   roles**, and enables the `vector` extension.
2. `02-datahub-schema.sql` — creates the `datahub` schema, seed tables,
   Row-Level Security policies, masked views, and sample data, all
   **owned by `ragmcp_app`** (not by the bootstrap superuser).

## Why ownership matters here

PostgreSQL's Row-Level Security has one sharp edge that matters a lot for
this project's whole security story: **a table's row-security policies are
evaluated using the privileges of the view/table's OWNER when accessed
through a view, and a superuser (or any role with `BYPASSRLS`) always
skips RLS entirely.**

The official `postgres` Docker image runs every init script as the
bootstrap superuser named by `POSTGRES_USER`/`POSTGRES_PASSWORD`. If we
had let that same superuser own the `datahub` tables and masked views,
every RLS policy and masking `CASE` expression in `02-datahub-schema.sql`
would silently do nothing — `ragmcp_readonly` would see every row and
every unmasked column, no matter what policies were defined, because
Postgres would just skip enforcement for a superuser-owned object.

So this repo deliberately keeps two identities apart:

- The bootstrap superuser (`POSTGRES_SUPERUSER_PASSWORD` in `.env`) —
  used only by the container itself, once, to run these scripts. The
  application never connects with it.
- `ragmcp_app` — a normal role (`NOSUPERUSER` is Postgres's default for a
  role created without `SUPERUSER`) that owns every object in `datahub`.
  Because it isn't a superuser and doesn't have `BYPASSRLS`, RLS is fully
  enforced for any other role — like `ragmcp_readonly` — querying through
  its views.

This is the same reason real Oracle deployments never let VPD/Data
Redaction policies be defined or owned by a DBA account that also holds
`EXEMPT ACCESS POLICY` — see `docs/oracle_datahub_security.md`.
