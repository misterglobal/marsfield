#!/usr/bin/env bash
set -Eeuo pipefail

TARGET_SHA="${1:-}"
PUBLIC_HEALTH_URL="${2:-}"
APP_DIR="${MARSFIELD_APP_DIR:-/root/marsfield/marsfield}"
BACKUP_DIR="${MARSFIELD_BACKUP_DIR:-/root/marsfield-backups}"
MIN_FREE_KB="${MARSFIELD_MIN_FREE_KB:-12582912}"
DEPLOY_STATE_DIR="${MARSFIELD_DEPLOY_STATE_DIR:-/root/marsfield-server}"

if [[ ! "$TARGET_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "A full 40-character commit SHA is required." >&2
  exit 2
fi
if [[ ! "$PUBLIC_HEALTH_URL" =~ ^https:// ]]; then
  echo "An HTTPS public health URL is required." >&2
  exit 2
fi

umask 077
mkdir -p "$BACKUP_DIR" "$DEPLOY_STATE_DIR"
exec 9>"$DEPLOY_STATE_DIR/deploy.lock"
if ! flock -n 9; then
  echo "Another production deployment is already running." >&2
  exit 2
fi

if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE=(docker-compose)
else
  echo "Docker Compose is required." >&2
  exit 2
fi

cd "$APP_DIR"

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Tracked production files must be clean before deployment." >&2
  exit 2
fi

git fetch origin main --quiet
RESOLVED_SHA="$(git rev-parse "${TARGET_SHA}^{commit}")"
if [[ "$RESOLVED_SHA" != "$TARGET_SHA" ]]; then
  echo "Target commit could not be resolved exactly." >&2
  exit 2
fi
if ! git merge-base --is-ancestor "$TARGET_SHA" origin/main; then
  echo "Target commit is not contained in origin/main." >&2
  exit 2
fi
if [[ "$TARGET_SHA" != "$(git rev-parse origin/main)" ]]; then
  echo "Target commit must be the current origin/main tip." >&2
  exit 2
fi

AVAILABLE_KB="$(df -Pk "$APP_DIR" | awk 'NR == 2 { print $4 }')"
if (( AVAILABLE_KB < MIN_FREE_KB )); then
  echo "Deployment requires at least ${MIN_FREE_KB} KB free; only ${AVAILABLE_KB} KB is available." >&2
  exit 2
fi

BACKEND_CONTAINER="$("${COMPOSE[@]}" ps -q backend)"
FRONTEND_CONTAINER="$("${COMPOSE[@]}" ps -q frontend)"
if [[ -z "$BACKEND_CONTAINER" || -z "$FRONTEND_CONTAINER" ]]; then
  echo "The current backend and frontend containers must be running." >&2
  exit 2
fi

PREVIOUS_SHA="$(git rev-parse HEAD)"
if ! git diff --quiet "$PREVIOUS_SHA" "$TARGET_SHA" -- backend/prisma/schema.prisma; then
  echo "Automated deployment refuses Prisma schema changes; use a separately reviewed migration procedure." >&2
  exit 2
fi
BACKEND_IMAGE_ID="$(docker inspect --format '{{.Image}}' "$BACKEND_CONTAINER")"
FRONTEND_IMAGE_ID="$(docker inspect --format '{{.Image}}' "$FRONTEND_CONTAINER")"
BACKEND_IMAGE_REF="$(docker inspect --format '{{.Config.Image}}' "$BACKEND_CONTAINER")"
FRONTEND_IMAGE_REF="$(docker inspect --format '{{.Config.Image}}' "$FRONTEND_CONTAINER")"
DEPLOY_ID="$(date -u +%Y%m%dT%H%M%SZ)"
BACKEND_ROLLBACK_REF="marsfield-rollback/backend:${DEPLOY_ID}"
FRONTEND_ROLLBACK_REF="marsfield-rollback/frontend:${DEPLOY_ID}"

mapfile -t OLD_ROLLBACK_IMAGES < <(docker images --format '{{.Repository}}:{{.Tag}}' | grep '^marsfield-rollback/' || true)
for image in "${OLD_ROLLBACK_IMAGES[@]}"; do
  docker image rm "$image"
done
docker tag "$BACKEND_IMAGE_ID" "$BACKEND_ROLLBACK_REF"
docker tag "$FRONTEND_IMAGE_ID" "$FRONTEND_ROLLBACK_REF"

DATABASE_BACKUP="$BACKUP_DIR/pre-deploy-${DEPLOY_ID}-${TARGET_SHA:0:12}.dump"
"${COMPOSE[@]}" exec -T postgres sh -c 'pg_dump -Fc -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > "$DATABASE_BACKUP"
test -s "$DATABASE_BACKUP"
"${COMPOSE[@]}" exec -T postgres pg_restore --list < "$DATABASE_BACKUP" >/dev/null
sha256sum "$DATABASE_BACKUP" > "$DATABASE_BACKUP.sha256"

wait_for_health() {
  local service=$1
  local attempts=${2:-60}
  local container
  for attempt in $(seq 1 "$attempts"); do
    container="$("${COMPOSE[@]}" ps -q "$service")"
    if [[ -n "$container" ]] && [[ "$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container")" == "healthy" ]]; then
      return 0
    fi
    sleep 2
  done
  return 1
}

wait_for_url() {
  local url=$1
  local attempts=${2:-6}
  for attempt in $(seq 1 "$attempts"); do
    if curl --fail --silent --show-error --max-time 20 "$url" >/dev/null; then
      return 0
    fi
    sleep 5
  done
  return 1
}

rollback() {
  local deployment_exit_code=${1:-1}
  local rollback_failed=0
  trap - ERR
  set +e
  echo "Deployment failed; restoring application images and source commit." >&2
  git checkout --detach "$PREVIOUS_SHA" --quiet || rollback_failed=1
  docker tag "$BACKEND_ROLLBACK_REF" "$BACKEND_IMAGE_REF" || rollback_failed=1
  docker tag "$FRONTEND_ROLLBACK_REF" "$FRONTEND_IMAGE_REF" || rollback_failed=1
  "${COMPOSE[@]}" up -d --no-deps --force-recreate backend frontend || rollback_failed=1
  wait_for_health backend 60 || rollback_failed=1
  wait_for_health frontend 60 || rollback_failed=1
  wait_for_url http://127.0.0.1:3000/ 6 || rollback_failed=1
  wait_for_url "$PUBLIC_HEALTH_URL" 6 || rollback_failed=1
  if (( rollback_failed )); then
    echo "CRITICAL: automatic application rollback did not restore healthy production." >&2
    exit 70
  fi
  echo "The previous application release was restored and passed health checks." >&2
  exit "$deployment_exit_code"
}
trap 'rollback "$?"' ERR

echo "Checking out production commit $TARGET_SHA."
git checkout --detach "$TARGET_SHA" --quiet
echo "Building backend and frontend images."
"${COMPOSE[@]}" build backend frontend
POST_BUILD_AVAILABLE_KB="$(df -Pk "$APP_DIR" | awk 'NR == 2 { print $4 }')"
if (( POST_BUILD_AVAILABLE_KB < 5242880 )); then
  echo "Build left less than 5 GiB free; refusing to replace running containers." >&2
  false
fi
"${COMPOSE[@]}" up -d --no-deps backend
wait_for_health backend 60

"${COMPOSE[@]}" up -d --no-deps frontend
wait_for_health frontend 60

echo "Verifying local and public health endpoints."
wait_for_url http://127.0.0.1:3000/ 6
wait_for_url "$PUBLIC_HEALTH_URL" 6
printf '%s\n' "$TARGET_SHA" > "$DEPLOY_STATE_DIR/current-release"
printf '%s\n' "$PREVIOUS_SHA" > "$DEPLOY_STATE_DIR/previous-release"
trap - ERR

if ! docker image prune -f >/dev/null; then
  echo "Warning: deployment succeeded, but dangling-image cleanup failed." >&2
fi
if mapfile -t OLD_BACKUPS < <(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'pre-deploy-*.dump' -printf '%T@ %p\n' | sort -nr | tail -n +11 | cut -d' ' -f2-); then
  for backup in "${OLD_BACKUPS[@]}"; do
    rm -f -- "$backup" "$backup.sha256" || echo "Warning: could not remove old backup $backup" >&2
  done
else
  echo "Warning: deployment succeeded, but backup-retention cleanup failed." >&2
fi

echo "Deployed $TARGET_SHA successfully."
echo "Database backup: $DATABASE_BACKUP"
echo "Rollback images: $BACKEND_ROLLBACK_REF and $FRONTEND_ROLLBACK_REF"
