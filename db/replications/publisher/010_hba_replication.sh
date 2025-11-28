#!/bin/sh
set -e

REPLICATION_USER="${REPLICATION_USER:-repuser}"

echo "host replication ${REPLICATION_USER} 0.0.0.0/0 md5" >> "$PGDATA/pg_hba.conf"
