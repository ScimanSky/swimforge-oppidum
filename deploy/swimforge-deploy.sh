#!/usr/bin/env bash
set -euo pipefail

exec 9>/tmp/swimforge-deploy.lock
flock -n 9 || { echo "Deploy gia in corso"; exit 1; }

REPO_DIR="/home/ubuntu/projects/swimforge-oppidum"
ENV_FILE="$REPO_DIR/.env.oracle"
COMPOSE_FILE="$REPO_DIR/docker-compose.oracle.yml"
HEALTH_BASE_URL="${DEPLOY_HEALTH_BASE_URL:-https://swimforge.it}"

git -C "$REPO_DIR" pull --ff-only origin main

docker compose \
  --env-file "$ENV_FILE" \
  -f "$COMPOSE_FILE" \
  up -d --build app

curl -fsS "$HEALTH_BASE_URL/ready" >/dev/null
curl -fsS "$HEALTH_BASE_URL/health" >/dev/null || true

echo "Deploy completato"
