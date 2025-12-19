#!/bin/sh
set -eu

for db in db_4 db_5 db_6 db_7; do
  echo "Creating and migrating database $db on shard 01"
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname=postgres <<-EOSQL
    CREATE DATABASE "$db";
EOSQL
for file in /schema/*.sql; do
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname="$db" -f "$file";
  done
done
