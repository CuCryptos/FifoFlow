# Restore FifoFlow database from Litestream backup

Use this when `fifoflow.db` is corrupt, accidentally wiped, or the droplet was rebuilt.

**RPO:** ~10 seconds (Litestream streams WAL every 10 s).

## Steps

SSH to the droplet:

```bash
ssh root@64.227.108.209
cd /opt/FifoFlow
source .env
```

Stop the app (Litestream can keep running):

```bash
docker compose stop fifoflow
```

Move the broken DB aside — never delete it outright, keep for forensics:

```bash
docker run --rm -v fifoflow_fifoflow-data:/data alpine \
  sh -c 'mv /data/fifoflow.db /data/fifoflow.db.broken-$(date +%Y%m%dT%H%M%S) 2>/dev/null || true'
```

(Adjust the volume name if your compose project prefix differs — check with `docker volume ls`.)

Restore the latest replica into the volume:

```bash
docker run --rm \
  -v fifoflow_fifoflow-data:/data \
  -e LITESTREAM_ACCESS_KEY_ID="$DO_SPACES_KEY" \
  -e LITESTREAM_SECRET_ACCESS_KEY="$DO_SPACES_SECRET" \
  litestream/litestream:0.3 \
  restore -o /data/fifoflow.db \
  s3://fifoflow-backups.nyc3.digitaloceanspaces.com/prod/fifoflow
```

Restart the app:

```bash
docker compose start fifoflow
```

Smoke test:

```bash
curl http://localhost:3001/api/health
# expect: {"status":"ok","store":"sqlite"}
```

Open the app in a browser and confirm items and recent transactions look correct.

## Point-in-time restore

Add `-timestamp '2026-04-21T03:15:00Z'` to the restore command to roll back to an earlier point. See [Litestream docs](https://litestream.io/reference/restore/).
