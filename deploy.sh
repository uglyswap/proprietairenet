#!/bin/bash
# Deploy Proprietaire.net frontend
# Run from OpenClaw container - uses docker socket + host filesystem via docker run
set -e

echo "=== Deploy Proprietaire.net frontend ==="
echo ""

echo "Step 1: Pull latest code from GitHub..."
docker run --rm -v /:/host alpine sh -c '
  apk add --no-cache git >/dev/null 2>&1
  git config --global --add safe.directory "/host/opt/projects/saas immo/frontend/project" 2>/dev/null || true
  cd "/host/opt/projects/saas immo/frontend/project"
  git pull origin main
  git log --oneline -1
'
echo ""

echo "Step 2: Rebuild and restart..."
COMPOSE_DIR="/opt/projects/saas immo/frontend"
COMPOSE_BIN="/home/node/.openclaw/workspace/bin/docker-compose"

# Stop existing container (avoid name conflict)
docker stop cadastre-frontend 2>/dev/null || true
docker rm cadastre-frontend 2>/dev/null || true

# Rebuild from GitHub code (pulled to local disk)
cd "$COMPOSE_DIR"
"$COMPOSE_BIN" up -d --build cadastre-frontend

echo ""
echo "=== Deploy complete ==="
docker ps --filter name=cadastre-frontend --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
echo ""
sleep 3
echo "Health check:"
curl -s -o /dev/null -w "GET /admin/ai -> HTTP %{http_code}" https://proprietaire.net/admin/ai
