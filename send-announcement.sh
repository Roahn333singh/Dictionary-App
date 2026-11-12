#!/usr/bin/env bash
# Send a custom Retain announcement to every phone that turned notifications on.
# Usage:
#   ./send-announcement.sh "New in Retain" "Scratch-and-reveal is here. Open Retain and try today's card."
#   ./send-announcement.sh "New in Retain" "Check your Inbox" "/inbox"
set -euo pipefail
cd "$(dirname "$0")"

if [[ $# -lt 2 ]]; then
  echo 'Usage: ./send-announcement.sh "Title" "Message" ["/path"]' >&2
  exit 1
fi

set -a
source .announce.local
source .env.local
set +a

python3 - "$1" "$2" "${3:-/}" "$VITE_SUPABASE_URL" "$ANNOUNCE_SECRET" <<'PY'
import json, sys, urllib.request

title, body, url, base, secret = sys.argv[1:6]
payload = json.dumps({"title": title, "body": body, "url": url}).encode()
req = urllib.request.Request(
    f"{base}/functions/v1/announce",
    data=payload,
    headers={"Content-Type": "application/json", "x-announce-secret": secret},
    method="POST",
)
try:
    with urllib.request.urlopen(req, timeout=30) as res:
        print(res.read().decode())
except urllib.error.HTTPError as e:
    print(f"Failed ({e.code}): {e.read().decode()}", file=sys.stderr)
    sys.exit(1)
PY
