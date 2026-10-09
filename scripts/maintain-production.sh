#!/usr/bin/env bash
set -Eeuo pipefail

PUBLIC_HEALTH_URL="${1:-}"
APP_DIR="${MARSFIELD_APP_DIR:-/root/marsfield/marsfield}"
BACKUP_DIR="${MARSFIELD_BACKUP_DIR:-/root/marsfield-backups}"
CLEANUP_THRESHOLD_KB="${MARSFIELD_CLEANUP_THRESHOLD_KB:-15728640}"
MINIMUM_FREE_KB="${MARSFIELD_MINIMUM_FREE_KB:-12582912}"
MAX_BACKUP_AGE_SECONDS="${MARSFIELD_MAX_BACKUP_AGE_SECONDS:-1209600}"

export COMPOSE_PROJECT_NAME="${MARSFIELD_COMPOSE_PROJECT_NAME:-marsfield}"
export COMPOSE_COMPATIBILITY="${MARSFIELD_COMPOSE_COMPATIBILITY:-1}"

log() {
  printf '[maintenance] %s\n' "$*"
}

fail() {
  printf '[maintenance] ERROR: %s\n' "$*" >&2
  exit 1
}

[[ "$PUBLIC_HEALTH_URL" =~ ^https://[A-Za-z0-9._~:/?#@%+=,\&-]+$ ]] || \
  fail "A valid HTTPS public health URL is required"
[[ -d "$APP_DIR" ]] || fail "Application directory not found: $APP_DIR"
[[ -d "$BACKUP_DIR" ]] || fail "Backup directory not found: $BACKUP_DIR"

if docker compose version >/dev/null 2>&1; then
  compose=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  compose=(docker-compose)
else
  fail "Docker Compose is not installed"
fi

cd "$APP_DIR"

if [[ -n "$(git status --short --untracked-files=no)" ]]; then
  fail "Tracked production checkout changes require review"
fi

for service in postgres redis backend frontend; do
  container_id="$("${compose[@]}" ps -q "$service")"
  [[ -n "$container_id" ]] || fail "$service container is not running"
  health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id")"
  [[ "$health" == "healthy" ]] || fail "$service container is not healthy (status: $health)"
done

latest_backup="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'pre-deploy-*.dump' -size +0c -printf '%T@ %p\n' | sort -nr | sed -n '1{s/^[^ ]* //;p;}')"
[[ -n "$latest_backup" ]] || fail "No non-empty pre-deployment backup was found"
backup_modified="$(stat -c %Y "$latest_backup")"
backup_age="$(( $(date +%s) - backup_modified ))"
(( backup_age <= MAX_BACKUP_AGE_SECONDS )) || fail "Latest pre-deployment backup is older than the allowed maximum"

health_status="$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' --max-time 20 "$PUBLIC_HEALTH_URL")"
[[ "$health_status" == "200" ]] || fail "Public health check returned HTTP $health_status"

free_before_kb="$(df --output=avail -k / | tail -n 1 | tr -d ' ')"
cleanup_performed=false

if (( free_before_kb < CLEANUP_THRESHOLD_KB )); then
  log "Free space is below the cleanup threshold; pruning dangling images and unused build cache"
  docker image prune --force
  docker builder prune --all --force
  cleanup_performed=true
else
  log "Free space is above the cleanup threshold; no cleanup is needed"
fi

free_after_kb="$(df --output=avail -k / | tail -n 1 | tr -d ' ')"
(( free_after_kb >= MINIMUM_FREE_KB )) || fail "Free space remains below the required minimum after maintenance"

log "Containers healthy: postgres, redis, backend, frontend"
log "Latest backup: $(basename "$latest_backup")"
log "Public health check: HTTP $health_status"
log "Cleanup performed: $cleanup_performed"
log "Free space before: $(( free_before_kb / 1024 / 1024 )) GiB"
log "Free space after: $(( free_after_kb / 1024 / 1024 )) GiB"
