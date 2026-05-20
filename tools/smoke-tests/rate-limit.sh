#!/usr/bin/env bash
# Rate-limit smoke test (bash / Git Bash on Windows)
#
# Fires BURST_COUNT empty-body POSTs at /api/leads/intake. Each request:
#   - passes auth (real API key)
#   - is counted by the rate limiter
#   - fails at body validation (400 rejected_validation)  -- no DNC call burned
#
# Once the configured rate_limit_per_minute is exceeded, subsequent requests
# return 429 rejected_rate_limit. Script exits 0 if any 429 is observed.
#
# Run:  ./rate-limit.sh

set -euo pipefail

dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
env_file="$dir/.env"

if [[ ! -f "$env_file" ]]; then
  echo "Missing .env. Copy .env.example to .env in this folder and fill it in." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$env_file"
set +a

HOST="${HOST:-}"
API_KEY="${API_KEY:-}"
BURST_COUNT="${BURST_COUNT:-25}"

if [[ -z "$HOST" || -z "$API_KEY" || "$API_KEY" == "pk_live_REPLACE_ME" ]]; then
  echo "HOST and API_KEY must be set to real values in .env" >&2
  exit 1
fi

echo "Firing $BURST_COUNT empty-body POSTs at $HOST/api/leads/intake"
echo

declare -A counts
for i in $(seq 1 "$BURST_COUNT"); do
  code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$HOST/api/leads/intake" \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -d '{}')
  counts[$code]=$(( ${counts[$code]:-0} + 1 ))
  marker=''
  [[ "$code" == "429" ]] && marker=' <- rate limited'
  [[ "$code" != "429" && "$code" != "400" ]] && marker=' <- unexpected'
  echo "[$i/$BURST_COUNT] HTTP $code$marker"
done

echo
echo "Status distribution:"
for code in $(printf '%s\n' "${!counts[@]}" | sort); do
  echo "  $code: ${counts[$code]}"
done

if [[ -n "${counts[429]:-}" && "${counts[429]}" -gt 0 ]]; then
  echo
  echo "Rate limit triggered (${counts[429]} x 429). PASS."
  exit 0
else
  echo
  echo "No 429 responses observed. Either the key's rate_limit_per_minute" >&2
  echo "is higher than BURST_COUNT ($BURST_COUNT), or the limiter is not engaged." >&2
  exit 1
fi
