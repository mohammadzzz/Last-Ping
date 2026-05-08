# Operational runbook

## First-time setup
1. Clone repo onto the home server. `cp .env.example .env`.
2. Generate secrets:
   ```
   MASTER_KEK=$(openssl rand -base64 32)
   AUTH_PEPPER=$(openssl rand -base64 32)
   SESSION_SECRET=$(openssl rand -base64 48)
   IP_HASH_SALT=$(openssl rand -base64 16)
   POSTGRES_PASSWORD=$(openssl rand -hex 24)
   ```
   Fill `.env` with these and with provider keys (Resend, Telegram,
   Twilio) and owner contact addresses.
3. `docker compose up -d db` → wait until `docker compose logs db`
   shows `database system is ready`.
4. Apply schema: `docker compose run --rm app npx prisma migrate deploy`.
5. Bootstrap owner: `docker compose run --rm app npm run bootstrap`.
   **Save the printed check-in link and TOTP QR** — they are shown
   exactly once.
6. `docker compose up -d app`. Visit `https://<your-host>/login`.
   Sign in; you'll be redirected to `/totp-setup`; scan QR; confirm.

## Daily / weekly operations
- Check in via login or via the PIN link at least weekly.
- Review `/audit` occasionally for anomalies.
- After uploading new files, go to `/recipients/<id>` and tick the
  files that should be included for each recipient.
- Write / revise per-recipient messages on the same page.

## Backups
- **Postgres**: `docker compose exec db pg_dump -U lastping lastping >
  backup.sql`. Run nightly via cron.
- **Files**: `tar -czf data-files-$(date +%F).tar.gz ./data/files`.
  These are already encrypted; safe to store offsite if the KEK is kept
  separately.
- Keep a copy of `.env` (especially `MASTER_KEK`) in a password manager
  or secure offline store. **Without the KEK, backups are useless.**

## KEK rotation
1. Generate `NEW_KEK = openssl rand -base64 32`.
2. Stop the app: `docker compose stop app`.
3. Run the rewrap migration (not implemented in MVP — add script
   `scripts/rewrap-deks.ts` that reads every `MediaFile`, unwraps its
   DEK with the old KEK, re-wraps with the new KEK, and writes it
   back in a single transaction per row).
4. Swap `MASTER_KEK` in `.env` to `NEW_KEK`.
5. Restart app. Verify a recipient download still decrypts.

## Recovery: "I'm alive but release fired"
1. Log in immediately and press **I'm alive** — this resets state and
   stops future warning/release fanout. It does *not* retract messages
   already sent.
2. Visit `/deliveries`. For each row with status `PENDING` or
   `VERIFIED`, manually update to `EXPIRED` (use `psql`):
   ```sql
   UPDATE "ReleaseRecipient" SET status='EXPIRED', "zipPath"=NULL
   WHERE status IN ('PENDING','VERIFIED');
   ```
3. Any pending ZIPs under `/data/tmp/` can be deleted by hand.
4. Personally contact recipients who already received a link and ask
   them not to proceed.

## Revoking a recipient's link before expiry
```sql
UPDATE "ReleaseRecipient" SET status='EXPIRED' WHERE id='<uuid>';
```
Then delete any `zipPath` file and restart — or wait for the expire
job to delete it automatically.

## Storage pressure
- Files are on `./data/files/` (encrypted). Each file is the plaintext
  size + 28 bytes (nonce + tag). Plan for ~recipient_count × avg_size.
- During active downloads, temporary ZIPs live in `./data/tmp/`. A
  recipient's ZIP is roughly the sum of their assigned files.

## Logs & observability
- `GET /api/health` → 200 on DB up.
- Container logs: `docker compose logs -f app`.
- Cron job logs are emitted with `scheduler` name via pino.
