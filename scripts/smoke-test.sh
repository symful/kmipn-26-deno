#!/bin/bash

BASE_URL="${BASE_URL:-http://localhost:8787}"
EVIDENCE_FILE="${EVIDENCE_FILE:-.sisyphus/evidence/task-5-smoke-baseline.txt}"

mkdir -p "$(dirname "$EVIDENCE_FILE")"

echo "=== SIGAP Smoke Test ===" | tee "$EVIDENCE_FILE"
echo "Base URL: $BASE_URL" | tee -a "$EVIDENCE_FILE"
echo "Timestamp: $(date -Iseconds)" | tee -a "$EVIDENCE_FILE"
echo "" | tee -a "$EVIDENCE_FILE"

echo "--- Logging in to get JWT token ---" | tee -a "$EVIDENCE_FILE"
LOGIN_RESP=$(curl -s -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@sigap.live","password":"admin123"}')
echo "Login response: $LOGIN_RESP" | tee -a "$EVIDENCE_FILE"

TOKEN=$(echo "$LOGIN_RESP" | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "FAIL: Could not obtain JWT token" | tee -a "$EVIDENCE_FILE"
  exit 1
fi

echo "Token obtained successfully" | tee -a "$EVIDENCE_FILE"
echo "" | tee -a "$EVIDENCE_FILE"

declare -a ENDPOINTS=(
  "GET:/api/categories:unauthenticated"
  "GET:/api/wilayah:unauthenticated"
  "GET:/api/admin/users:authenticated"
  "GET:/api/admin/priority-config:authenticated"
  "GET:/api/admin/outbox:authenticated"
  "GET:/api/audit/search:authenticated"
  "GET:/api/agent/assessments:authenticated"
  "POST:/api/outbox/dlq/reconcile:authenticated"
  "POST:/api/reports/share-filter:authenticated"
  "GET:/api/admin/outbox/stats:authenticated"
)

echo "--- Testing Endpoints ---" | tee -a "$EVIDENCE_FILE"
echo "" | tee -a "$EVIDENCE_FILE"

for entry in "${ENDPOINTS[@]}"; do
  IFS=':' read -r METHOD PATH AUTH <<< "$entry"

  if [ "$AUTH" = "authenticated" ]; then
    HEADERS="-H \"Authorization: Bearer $TOKEN\""
  else
    HEADERS=""
  fi

  echo "Testing $METHOD $PATH ($AUTH)..." | tee -a "$EVIDENCE_FILE"

  RESP=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X "$METHOD" "$BASE_URL$PATH" $HEADERS)
  BODY=$(echo "$RESP" | sed '$d')
  STATUS=$(echo "$RESP" | tail -1 | cut -d: -f2)

  echo "  Status: $STATUS" | tee -a "$EVIDENCE_FILE"
  echo "  Response (first 500 chars): ${BODY:0:500}" | tee -a "$EVIDENCE_FILE"
  echo "" | tee -a "$EVIDENCE_FILE"
done

echo "=== Smoke Test Complete ===" | tee -a "$EVIDENCE_FILE"
