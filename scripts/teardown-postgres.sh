#!/usr/bin/env bash
# teardown-postgres.sh: cleans up the Homebrew-managed PostgreSQL role/database.
# Sources .env, removes the requested resources, and can stop the local service.

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$PROJECT_ROOT/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "❌ .env not found at $ENV_FILE"
  exit 1
fi

set -o allexport
source "$ENV_FILE"
set +o allexport

REQUIRED_VARS=(DB_USER DB_PASS DB_NAME DB_VERSION)
for var_name in "${REQUIRED_VARS[@]}"; do
  if [[ -z "${!var_name:-}" ]]; then
    echo "❌ Environment variable $var_name is not set in .env"
    exit 1
  fi
done

if ! command -v brew >/dev/null 2>&1; then
  echo "❌ Homebrew is required but not found. Install it from https://brew.sh/."
  exit 1
fi

PSQL_FORMULA="postgresql@${DB_VERSION}"
BREW_PREFIX="$(brew --prefix "$PSQL_FORMULA" 2>/dev/null || true)"
if [[ -n "$BREW_PREFIX" && -d "$BREW_PREFIX/bin" ]]; then
  export PATH="$BREW_PREFIX/bin:$PATH"
fi

if command -v psql >/dev/null 2>&1; then
  echo "🗄️ Checking database $DB_NAME..."
  DB_EXISTS=$(psql postgres -Atqc "SELECT 1 FROM pg_database WHERE datname = '${DB_NAME}'" 2>/dev/null || echo "")
  if [[ "$DB_EXISTS" == "1" ]]; then
    echo "🧹 Dropping database $DB_NAME..."
    dropdb "$DB_NAME"
  else
    echo "ℹ️ Database $DB_NAME not found; nothing to drop."
  fi

  echo "👤 Checking role $DB_USER..."
  ROLE_EXISTS=$(psql postgres -Atqc "SELECT 1 FROM pg_roles WHERE rolname = '${DB_USER}'" 2>/dev/null || echo "")
  if [[ "$ROLE_EXISTS" == "1" ]]; then
    echo "🧹 Dropping role $DB_USER..."
    dropuser "$DB_USER"
  else
    echo "ℹ️ Role $DB_USER not found; nothing to drop."
  fi
else
  echo "ℹ️ psql client not found; skipping role and database removal."
fi

if [[ "${SKIP_POSTGRES_STOP:-false}" != "true" ]]; then
  echo "🛑 Stopping PostgreSQL service..."
  if brew services list | grep -q "^postgresql@${DB_VERSION}\s"; then
    brew services stop "$PSQL_FORMULA" || echo "⚠️ Unable to stop PostgreSQL service (already stopped?)."
  else
    echo "ℹ️ PostgreSQL service postgresql@${DB_VERSION} is not managed by brew services."
  fi
else
  echo "⏭️ Skipping brew services stop (SKIP_POSTGRES_STOP=true)."
fi

echo "✅ PostgreSQL teardown complete!"
