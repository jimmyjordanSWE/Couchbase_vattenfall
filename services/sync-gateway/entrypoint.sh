#!/bin/sh
set -e

# Substitute environment variables in config
sed -e "s/\${COUCHBASE_SERVER}/$COUCHBASE_SERVER/g" \
    -e "s/\${COUCHBASE_USERNAME}/$COUCHBASE_USERNAME/g" \
    -e "s/\${COUCHBASE_PASSWORD}/$COUCHBASE_PASSWORD/g" \
    /etc/sync_gateway/sync-gateway-config.json > /tmp/sync-gateway-config.json

# Start Sync Gateway in the background
/entrypoint.sh /tmp/sync-gateway-config.json &
PID=$!

# Wait for Admin API to be available
echo "Waiting for Sync Gateway Admin API..."
until curl -s http://127.0.0.1:4985/ > /dev/null; do
  sleep 2
done

echo "Sync Gateway is up. Configuring database..."

# Create the database after Couchbase finishes exposing the bucket.
# Sync Gateway can come up before the bucket is queryable, so retry on transient 5xx.
DB_CREATE_URL="http://127.0.0.1:4985/main/"
ATTEMPTS=0
MAX_ATTEMPTS=30
until [ "$ATTEMPTS" -ge "$MAX_ATTEMPTS" ]; do
  ATTEMPTS=$((ATTEMPTS + 1))
  STATUS="$(curl -sS -o /tmp/sync-gateway-db-create.out -w '%{http_code}' \
    -X PUT "$DB_CREATE_URL" \
    -u "${COUCHBASE_USERNAME}:${COUCHBASE_PASSWORD}" \
    -H "Content-Type: application/json" \
    -d @/etc/sync_gateway/database.json || true)"

  case "$STATUS" in
    200|201|202)
      echo "Database configured."
      break
      ;;
    409|412)
      echo "Database already configured."
      break
      ;;
    *)
      echo "Database setup attempt $ATTEMPTS/$MAX_ATTEMPTS failed with HTTP $STATUS"
      cat /tmp/sync-gateway-db-create.out
      if [ "$ATTEMPTS" -ge "$MAX_ATTEMPTS" ]; then
        echo "Failed to configure Sync Gateway database."
        kill "$PID" 2>/dev/null || true
        wait "$PID" || true
        exit 1
      fi
      sleep 2
      ;;
  esac
done

# Wait for the Sync Gateway process
wait $PID
