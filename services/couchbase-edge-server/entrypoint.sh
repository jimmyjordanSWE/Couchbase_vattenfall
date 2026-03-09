#!/bin/sh
set -e

SYNC_GATEWAY_HOST="$(echo "$SYNC_GATEWAY_URL" | sed -E 's#^[a-z]+://([^/:]+).*#\1#')"
SYNC_GATEWAY_PORT="$(echo "$SYNC_GATEWAY_URL" | sed -E 's#^[a-z]+://[^/:]+:([0-9]+).*#\1#')"

echo "Waiting for Sync Gateway to be ready..."
until curl -fsS --max-time 2 "http://$SYNC_GATEWAY_HOST:$SYNC_GATEWAY_PORT/" > /dev/null 2>&1; do
  echo "Sync Gateway not ready, retrying in 2s..."
  sleep 2
done
echo "Sync Gateway is ready. Starting Edge Server..."

sed "s#\${SYNC_GATEWAY_URL}#$SYNC_GATEWAY_URL#g" \
  /etc/edge-server/config.json > /tmp/edge-server-config.json

exec couchbase-edge-server --verbose /tmp/edge-server-config.json
