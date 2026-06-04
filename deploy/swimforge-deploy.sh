#!/usr/bin/env bash
set -euo pipefail

exec 9>/tmp/swimforge-deploy.lock
flock -n 9 || { echo "Deploy gia in corso"; exit 1; }

REPO_DIR="/home/ubuntu/projects/swimforge-oppidum"
ENV_FILE="$REPO_DIR/.env.oracle"
COMPOSE_FILE="$REPO_DIR/docker-compose.oracle.yml"
HEALTH_BASE_URL="${DEPLOY_HEALTH_BASE_URL:-https://swimforge.it}"

git -C "$REPO_DIR" pull --ff-only origin main

APP_RELEASE="${APP_RELEASE:-$(git -C "$REPO_DIR" rev-parse --short=12 HEAD)}"
APP_COMMIT_SHA="${APP_COMMIT_SHA:-$APP_RELEASE}"
DEPLOY_TARGET="${DEPLOY_TARGET:-oracle}"
export APP_RELEASE APP_COMMIT_SHA DEPLOY_TARGET

docker compose \
  --env-file "$ENV_FILE" \
  -f "$COMPOSE_FILE" \
  up -d --build app garmin

docker compose \
  --env-file "$ENV_FILE" \
  -f "$COMPOSE_FILE" \
  exec -T garmin sh -lc 'chmod 700 /data/tokens && find /data/tokens -type f -name "*.json" -exec chmod 600 {} \;'

curl -fsS "$HEALTH_BASE_URL/ready" >/dev/null
curl -fsS "$HEALTH_BASE_URL/health/deep" >/dev/null || true

echo "Deploy completato"
