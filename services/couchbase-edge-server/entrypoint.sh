#!/bin/sh
set -e

echo "Waiting for Sync Gateway database to be ready..."
until wget -qO- http://sync-gateway:4984/main/ > /dev/null 2>&1; do
  echo "Sync Gateway database not ready, retrying in 2s..."
  sleep 2
done
echo "Sync Gateway database is ready. Starting Edge Server..."

exec couchbase-edge-server --verbose /etc/edge-server/config.json
