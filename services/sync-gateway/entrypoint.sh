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

attempt=1
max_attempts=60

while [ "$attempt" -le "$max_attempts" ]; do
  # Create the database (use trailing slash to avoid 301 redirect).
  # This can race the bucket provisioning step, so retry until Couchbase is ready.
  status_code=$(
    curl -sS -o /tmp/sync-gateway-db-create.out -w "%{http_code}" \
      -X PUT http://127.0.0.1:4985/main/ \
      -u "${COUCHBASE_USERNAME}:${COUCHBASE_PASSWORD}" \
      -H "Content-Type: application/json" \
      -d @/etc/sync_gateway/database.json
  )

  case "$status_code" in
    200|201|202|409|412)
      echo "Database configuration accepted with status ${status_code}."
      break
      ;;
    *)
      echo "Database configuration attempt ${attempt}/${max_attempts} returned ${status_code}:"
      cat /tmp/sync-gateway-db-create.out
      if [ "$attempt" -eq "$max_attempts" ]; then
        echo "Failed to configure Sync Gateway database after ${max_attempts} attempts."
        exit 1
      fi
      sleep 2
      ;;
  esac

  attempt=$((attempt + 1))
done

echo "Database configured."

# Wait for the Sync Gateway process
wait $PID
