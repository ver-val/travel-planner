#!/bin/sh
set -e

REPLICATION_USER="${REPLICATION_USER:-repuser}"
REPLICATION_PASSWORD="${REPLICATION_PASSWORD:-repuser}"
PRIMARY_HOST="${PRIMARY_HOST:-postgres}"
PRIMARY_PORT="${PRIMARY_PORT:-5432}"
SLOT_NAME="${REPLICATION_SLOT:-standby_slot}"
APPLICATION_NAME="${APPLICATION_NAME:-travel_planner_replica}"

if pg_ctl -D "$PGDATA" status >/dev/null 2>&1; then
  pg_ctl -D "$PGDATA" -m fast stop || true
fi
rm -rf "${PGDATA:?}/"*

echo "[replica-init] Waiting for primary ${PRIMARY_HOST}:${PRIMARY_PORT}..."
until pg_isready -h "$PRIMARY_HOST" -p "$PRIMARY_PORT" -U "$REPLICATION_USER"; do
  sleep 1
done

echo "[replica-init] Starting base backup from primary"
export PGPASSWORD="$REPLICATION_PASSWORD"
pg_basebackup \
  -h "$PRIMARY_HOST" \
  -p "$PRIMARY_PORT" \
  -D "$PGDATA" \
  -U "$REPLICATION_USER" \
  -Fp -Xs -P \
  -R \
  -C -S "$SLOT_NAME"

echo "primary_conninfo = 'host=${PRIMARY_HOST} port=${PRIMARY_PORT} user=${REPLICATION_USER} password=${REPLICATION_PASSWORD} application_name=${APPLICATION_NAME}'" >> "$PGDATA/postgresql.auto.conf"
echo "[replica-init] Base backup completed, standby configured"
