# Travel Planner API (NestJS + PostgreSQL)

Feature-rich REST API for collaborative travel planning. Built with NestJS and PostgreSQL, it
showcases ordered travel locations, optimistic locking, and thorough validation.

---

## Architecture Snapshot

- **Stack**: NestJS, TypeORM, PostgreSQL, Jest, Hurl.
- **Entities**: `TravelPlan`, `Location` (both with `version`, `created_at`, `updated_at`).
- **Validation**: Global `ValidationPipe` with uniform `{ error, details }` errors and a custom
  `UuidPipe` that accepts all RFC4122 UUIDs (including all-zero IDs used in tests).
- **Logging**: `AllExceptionsFilter` centralises error logging; services emit debug/error logs for
  CRUD operations.

---

## Quick Start (Docker)

```bash
cp .env.example .env
# Ensure ports 3000, primary Postgres host port (`DB_PORT_EXPOSE`, default 5432), and PgCat host ports (`PGCAT_PORT`, `PGCAT_ADMIN_PORT`; defaults 6432/9930) are free.
docker compose up --build

# Swagger UI http://localhost:3000/docs
```

Docker runs migrations automatically before starting the API.

### Local Development without Docker

```bash
npm install
npm run migration:run    # requires access to your local PostgreSQL
npm run start:dev        # Nest watch mode
```

---

## NPM Scripts Cheat Sheet

| Command | Description |
|---------|-------------|
| `npm run start` | Launch compiled app (`dist/src/main.js`). |
| `npm run start:dev` | Development mode with hot reload. |
| `npm run build` | Compile TypeScript sources. |
| `npm test` | Jest unit suite (services). |
| `npm run test:e2e` | End-to-end suite (needs the test database; see `docker-compose.test.yml`). |
| `npm run test:hurl` | Contract checks using Hurl against `http://localhost:3000`. |
| `npm run migration:run` | Apply pending TypeORM migrations. |
| `npm run migration:revert` | Roll back the last migration. |
| `npm run migration:generate -- <name>` | Generate a migration skeleton. |
| `npm run swagger:export` | Export OpenAPI spec to `docs/traveler_api.json` (requires DB). |

> `swagger:export` spins up the Nest application to gather metadata. Because repositories are
> TypeORM-backed, an actual database connection is still required. Bring up Postgres (e.g.
> `docker compose up postgres`) before running the export. When executing outside Docker, the
> script automatically ignores `DATABASE_URL` if it still points at the compose host (`postgres` or
> `pgcat`) so that `DB_HOST`/`DB_PORT` are used instead.

---

## Optimistic Locking

Both travel plans and locations enforce optimistic locking:

- Requests must supply the `version` field on PUT operations.
- Updates use `WHERE id = :id AND version = :version` and increment the column automatically.
- Conflicts return **409** with `current_version`, letting clients refresh and retry.
- E2E/Hurl scenarios illustrate mixed success/conflict and retry flows.

This prevents concurrent travellers from overwriting each other’s data.

---

## Documentation & Tooling

- **Swagger UI**: `http://localhost:3000/docs`
- **Swagger JSON**: `npm run swagger:export` → `docs/traveler_api.json`
- **UUID Validation**: Shared `UuidPipe` ensures meaningful errors while accepting the all-zero UUID
  used in validation tests.

---

## Database Notes

- PgCat proxies all application traffic on `pgcat:6432`, routing writes to the primary (`postgres`)
  and balancing read queries across both replicas.
- UUIDs are generated via PostgreSQL `pgcrypto` (`gen_random_uuid()`).
- Trigger-based logic assigns `visit_order` when omitted.
- `locations` table now includes both `updated_at` and `version` columns for full auditing.
- Production images (`Dockerfile`) run migrations automatically at startup.

---

## Physical Replication (async → optional sync)

The compose setup runs a primary (`postgres`) plus a standby (`postgres_sub`) using physical streaming
replication. Default start is **asynchronous** to avoid bootstrap deadlocks; you can switch to
**synchronous** once both nodes are up.

Bring up cleanly:

```bash
docker compose down -v
docker compose up --build
```

Verify standby is in recovery:

```bash
docker compose exec postgres_sub psql -U postgres -d travel_planner -c "SELECT pg_is_in_recovery();"
```

Check replication stream on primary:

```bash
docker compose exec postgres psql -U postgres -d postgres -c \
"SELECT application_name, state, sync_state FROM pg_stat_replication;"
```

Enable synchronous mode (after standby is connected):

```bash
docker compose exec postgres psql -U postgres -d postgres -c \
"ALTER SYSTEM SET synchronous_standby_names='FIRST 1 (travel_planner_replica)';"
docker compose exec postgres psql -U postgres -d postgres -c \
"ALTER SYSTEM SET synchronous_commit='remote_apply';"
docker compose exec postgres psql -U postgres -d postgres -c "SELECT pg_reload_conf();"
```

Confirm `sync_state` becomes `sync` on primary. Standby stays in recovery (`pg_is_in_recovery() = t`);
you can watch WAL apply lag on the standby with
`SELECT pg_last_wal_receive_lsn(), pg_last_wal_replay_lsn();`.

---

## Testing Strategy

- **Unit** (`npm test`): service-level logic with repository mocks.
- **E2E** (`npm run test:e2e`): bootstraps the Nest app against a disposable Postgres instance.
- **Hurl** (`npm run test:hurl`): validates response shapes, error messages, and optimistic locking
  behaviour against a running API.

All suites cover the optimistic-lock handshake and validation edge cases.

---

## Swagger Export Troubleshooting

If `npm run swagger:export` exits with code 1, check:

1. PostgreSQL is reachable with the credentials in `.env`.
2. Migrations have been applied (`npm run migration:run`).
3. No other process is occupying the configured DB port.

The script prints an actionable error message on failure.

---

## License

MIT
