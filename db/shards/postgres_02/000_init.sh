#!/bin/sh
set -eu

for db in db_8 db_9 db_a db_b; do
  echo "Creating and migrating database $db on shard 02"
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname=postgres <<-EOSQL
    CREATE DATABASE "$db";
EOSQL
for file in /schema/*.sql; do
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname="$db" -f "$file";
  done
done
