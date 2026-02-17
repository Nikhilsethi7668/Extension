#!/usr/bin/env bash
# Set app.flashfender.com (and www.app) to CNAME to the Cloudflare Tunnel.
# Requires: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ZONE_ID (flashfender.com zone ID).
# Get zone ID: Dashboard → flashfender.com → Overview → Zone ID (right sidebar).
# Create API token: My Profile → API Tokens → Create Token → Edit zone DNS template.

set -e
ZONE_ID="${CLOUDFLARE_ZONE_ID}"
TOKEN="${CLOUDFLARE_API_TOKEN}"
TUNNEL_CNAME="188d6a93-5a38-4e9e-ada9-13c7de2eb1ac.cfargotunnel.com"

if [[ -z "$ZONE_ID" || -z "$TOKEN" ]]; then
  echo "Set CLOUDFLARE_ZONE_ID and CLOUDFLARE_API_TOKEN (flashfender.com zone)."
  exit 1
fi

for NAME in "app" "www.app"; do
  echo "=== $NAME.flashfender.com ==="
  # List existing records for this name
  RECORDS=$(curl -s -X GET "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records?name=${NAME}.flashfender.com&type=A,CNAME" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json")
  RECORD_IDS=$(echo "$RECORDS" | jq -r '.result[]?.id // empty')
  if [[ -n "$RECORD_IDS" ]]; then
    for RID in $RECORD_IDS; do
      echo "Deleting existing record $RID"
      curl -s -X DELETE "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records/${RID}" \
        -H "Authorization: Bearer ${TOKEN}" > /dev/null
    done
  fi
  echo "Creating CNAME ${NAME} -> ${TUNNEL_CNAME}"
  curl -s -X POST "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    --data "{\"type\":\"CNAME\",\"name\":\"${NAME}\",\"content\":\"${TUNNEL_CNAME}\",\"ttl\":1,\"proxied\":true}" | jq -r '.success as $ok | if $ok then "Created." else .errors end'
done
echo "Done. Wait ~1 min then try https://app.flashfender.com"
