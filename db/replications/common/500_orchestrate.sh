#!/bin/sh
set -e

log() {
  echo "[replication-init] $1"
}

run_sql_files() {
  directory="$1"
  label="$2"

  if [ ! -d "$directory" ]; then
    return
  fi

  find "$directory" -maxdepth 1 -type f -name '*.sql' | sort | while read -r file; do
    log "Applying $label script: $(basename "$file")"
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -f "$file"
  done
}

run_replication_scripts() {
  directory="$1"

  if [ ! -d "$directory" ]; then
    return
  fi

  find "$directory" -maxdepth 1 -type f \( -name '*.sql' -o -name '*.sh' \) | sort | while read -r file; do
    case "$file" in
      *.sql)
        log "Applying replication SQL: $(basename "$file")"
        psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -f "$file"
        ;;
      *.sh)
        log "Running replication script: $(basename "$file")"
        sh "$file"
        ;;
    esac
  done
}

run_sql_files "/docker-entrypoint-migrations" "migration"
run_replication_scripts "/docker-entrypoint-replications"
