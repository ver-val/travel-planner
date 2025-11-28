#!/bin/sh
set -e

REPLICATION_USER="${REPLICATION_USER:-repuser}"
REPLICATION_CIDR="${REPLICATION_CIDR:-172.18.0.0/16}"

echo "host replication ${REPLICATION_USER} ${REPLICATION_CIDR} scram-sha-256" >> "$PGDATA/pg_hba.conf"
