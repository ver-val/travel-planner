# Travel Planner API (NestJS + PostgreSQL)

Monolithic REST API demonstrating optimistic locking and ordered locations.

## Quick start

```bash
cp .env.example .env
docker compose up --build
# API http://localhost:3000/api
# Swagger http://localhost:3000/docs
```

Run migrations locally (optional):

```bash
npm i
npm run migration:run
```

## Tests

- Unit: `npm test`
- E2E (requires test DB; easiest via compose): `docker compose -f docker-compose.test.yml up --build --abort-on-container-exit`

## Optimistic Locking

Updates use `WHERE id = :id AND version = :version` and increment `version` atomically.
On conflict, API returns **409** with `current_version` in body.

## Notes

- UUIDs generated via `pgcrypto` (`gen_random_uuid()`).
- DB triggers handle `visit_order` auto-assignment.
- All package versions are pinned (no carets).
- Swagger JSON at `docs/traveler_api.json` (also available via `/docs`).
