#!/bin/sh
set -e

REPLICATION_USER="${REPLICATION_USER:-repuser}"
REPLICATION_CIDR="${REPLICATION_CIDR:-172.18.0.0/16}"
APP_CIDR="${APP_CIDR:-172.18.0.0/16}"

cat > "$PGDATA/pg_hba.conf" <<EOF
# Hardened pg_hba.conf
local   all             all                                     scram-sha-256
host    all             all             127.0.0.1/32            scram-sha-256
host    all             all             ::1/128                 scram-sha-256
host    all             all             ${APP_CIDR}             scram-sha-256
host    replication     ${REPLICATION_USER} ${REPLICATION_CIDR} scram-sha-256
EOF
