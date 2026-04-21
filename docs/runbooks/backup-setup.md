# Litestream backup setup (one-time)

## 1. Create the Spaces bucket

1. Log in to DigitalOcean.
2. Spaces → Create a Spaces Bucket.
3. Region: NYC3 (match `litestream.yml`). Change both if you use a different region.
4. Name: `fifoflow-backups`.
5. File Listing: Restricted.
6. Create.

## 2. Create access keys

1. API → Spaces Keys → Generate New Key.
2. Name: `fifoflow-litestream`.
3. Copy the access key and secret immediately — the secret is shown once.

## 3. Install on droplet

SSH to the droplet:

```bash
ssh root@64.227.108.209
cd /opt/FifoFlow
```

Edit `.env` and add:

```
DO_SPACES_KEY=<access key from step 2>
DO_SPACES_SECRET=<secret from step 2>
```

## 4. Pull and deploy

```bash
git pull
docker compose up -d --build
```

## 5. Verify replication

```bash
docker compose logs -f litestream
```

Within 10–30 seconds you should see lines like:

```
litestream | level=INFO msg="replicating db" db=/data/fifoflow.db replica=s3
litestream | level=INFO msg="snapshot written" ...
```

## 6. Verify in Spaces console

DigitalOcean → Spaces → `fifoflow-backups` → you should see a `prod/fifoflow/` prefix containing `snapshots/` and `wal/` directories within a few minutes.

## Rotation / retention

- WAL segments retained 720 h (30 days) per `litestream.yml`.
- Snapshots taken every 24 h.
- Nothing else to manage; retention is enforced by Litestream.
