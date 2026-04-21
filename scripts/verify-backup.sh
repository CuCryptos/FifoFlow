#!/usr/bin/env bash
# Manual monthly sanity check: restore latest replica to a scratch file
# and run integrity_check. Run from droplet after sourcing /opt/FifoFlow/.env.

set -euo pipefail

if [[ -z "${DO_SPACES_KEY:-}" || -z "${DO_SPACES_SECRET:-}" ]]; then
  echo "ERROR: DO_SPACES_KEY / DO_SPACES_SECRET not set. Source .env first." >&2
  exit 1
fi

SCRATCH=$(mktemp -d)
trap 'rm -rf "$SCRATCH"' EXIT

echo "Restoring latest replica to $SCRATCH/fifoflow.db ..."
docker run --rm \
  -v "$SCRATCH":/out \
  -e LITESTREAM_ACCESS_KEY_ID="$DO_SPACES_KEY" \
  -e LITESTREAM_SECRET_ACCESS_KEY="$DO_SPACES_SECRET" \
  litestream/litestream:0.3 \
  restore -o /out/fifoflow.db \
  s3://fifoflow-backups.nyc3.digitaloceanspaces.com/prod/fifoflow

echo "Running integrity_check ..."
RESULT=$(docker run --rm -v "$SCRATCH":/d alpine \
  sh -c 'apk add --no-cache sqlite >/dev/null 2>&1; sqlite3 /d/fifoflow.db "PRAGMA integrity_check;"')

echo "$RESULT"
if [[ "$RESULT" == "ok" ]]; then
  echo "OK: restored DB passes integrity check."
  exit 0
else
  echo "FAIL: integrity_check returned: $RESULT" >&2
  exit 1
fi
