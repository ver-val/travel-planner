#!/usr/bin/env bash
# setup-postgres.sh: helper for provisioning local PostgreSQL via Homebrew.
# Sources .env, ensures the requested role/database exist, and performs a connection check.

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

if ! command -v psql >/dev/null 2>&1; then
  echo "📦 Installing $PSQL_FORMULA..."
  brew install "$PSQL_FORMULA"
elif ! brew list "$PSQL_FORMULA" >/dev/null 2>&1; then
  echo "📦 Installing $PSQL_FORMULA (matching requested version)..."
  brew install "$PSQL_FORMULA"
else
  echo "✅ PostgreSQL $DB_VERSION already available."
fi

HOMEBREW_PREFIX="$(brew --prefix 2>/dev/null || true)"
FORMULA_PREFIX="$(brew --prefix "$PSQL_FORMULA" 2>/dev/null || true)"

if [[ -n "$FORMULA_PREFIX" && -d "$FORMULA_PREFIX/bin" ]]; then
  export PATH="$FORMULA_PREFIX/bin:$PATH"
fi

PG_BIN_DIR=""
if command -v psql >/dev/null 2>&1; then
  PG_BIN_DIR="$(dirname "$(command -v psql)")"
elif [[ -n "$FORMULA_PREFIX" && -d "$FORMULA_PREFIX/bin" ]]; then
  PG_BIN_DIR="$FORMULA_PREFIX/bin"
fi

DATA_DIR="${HOMEBREW_PREFIX}/var/postgresql@${DB_VERSION}"

if [[ -n "$PG_BIN_DIR" && -x "$PG_BIN_DIR/initdb" && ! -f "$DATA_DIR/PG_VERSION" ]]; then
  echo "🆕 Initialising PostgreSQL data directory at $DATA_DIR..."
  mkdir -p "$DATA_DIR"
  "$PG_BIN_DIR/initdb" -D "$DATA_DIR"
fi

echo "🚀 Starting PostgreSQL service..."
if ! brew services start "$PSQL_FORMULA"; then
  echo "ℹ️ Restarting PostgreSQL service..."
  brew services restart "$PSQL_FORMULA"
fi

READY=false
if command -v pg_isready >/dev/null 2>&1; then
  echo "⏳ Waiting for PostgreSQL to accept connections..."
  for attempt in {1..30}; do
    if pg_isready -h localhost >/dev/null 2>&1; then
      READY=true
      break
    fi
    sleep 1
  done
else
  READY=true
fi

if [[ "$READY" != "true" ]]; then
  echo "❌ PostgreSQL did not become ready in time. Check brew services list for errors."
  exit 1
fi

escape_psql_string() {
  printf "%s" "$1" | sed "s/'/''/g"
}

ROLE_EXISTS=$(psql postgres -Atqc "SELECT 1 FROM pg_roles WHERE rolname = '${DB_USER}'" 2>/dev/null || echo "")
if [[ "$ROLE_EXISTS" != "1" ]]; then
  echo "👤 Creating role $DB_USER..."
  createuser -s "$DB_USER"
else
  echo "ℹ️ Role $DB_USER already exists."
fi

PASSWORD_ESCAPED="$(escape_psql_string "$DB_PASS")"
echo "🔐 Ensuring password for $DB_USER..."
psql postgres -v ON_ERROR_STOP=1 -c "ALTER ROLE \"$DB_USER\" WITH PASSWORD '${PASSWORD_ESCAPED}';"

DB_EXISTS=$(psql postgres -Atqc "SELECT 1 FROM pg_database WHERE datname = '${DB_NAME}'" 2>/dev/null || echo "")
if [[ "$DB_EXISTS" != "1" ]]; then
  echo "🗄️ Creating database $DB_NAME owned by $DB_USER..."
  createdb -O "$DB_USER" "$DB_NAME"
else
  echo "ℹ️ Database $DB_NAME already exists."
fi

echo "🧪 Checking connection..."
PGPASSWORD="$DB_PASS" psql -h localhost -U "$DB_USER" -d "$DB_NAME" -c "SELECT version();"

echo "🎉 PostgreSQL setup complete!"
