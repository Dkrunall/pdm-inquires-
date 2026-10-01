#!/usr/bin/env bash
# Sends a sample Webflow (API V2) form submission to the booking endpoint.
# Usage: ./scripts/test-webhook.sh [url]
# Default URL: http://localhost:3000/api/booking?key=$WEBHOOK_KEY
set -euo pipefail

URL="${1:-http://localhost:3000/api/booking?key=${WEBHOOK_KEY:-}}"

curl -sS -X POST "$URL" \
  -H "Content-Type: application/json" \
  -w "\nHTTP %{http_code}\n" \
  --data-binary @- <<'JSON'
{
  "triggerType": "form_submission",
  "payload": {
    "name": "Enquiry Form",
    "siteId": "test-site",
    "data": {
      "Name": "Rahul Sharma",
      "Email-id": "rahul@example.com",
      "Phone-number": "+91 98765 43210",
      "Message-Inquiry": "Looking to book a table for 6 this Saturday"
    },
    "submittedAt": "2026-10-01T14:32:10.000Z",
    "id": "test-submission",
    "formId": "test-form"
  }
}
JSON
