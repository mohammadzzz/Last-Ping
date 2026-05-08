# Last Ping

Private, self-hosted digital-legacy delivery. If the owner stops checking in,
pre-prepared encrypted media and personal messages are released to specific
recipients via one-time secure download links.

**Not a legal will.** Strictly a private delivery system for personal use.

See `docs/PRD.md`, `docs/SECURITY.md`, `docs/RUNBOOK.md`.

## Quickstart

```
cp .env.example .env        # fill in secrets
docker compose up -d db
docker compose run --rm app npx prisma migrate deploy
docker compose run --rm app npm run bootstrap
docker compose up -d app
```

Visit `https://<your-host>/login`.

## Development

```
npm install
cp .env.example .env
# point DATABASE_URL at a local postgres, set the required secrets
npx prisma migrate dev
npm run dev
```

### Tests

Requires Docker (tests spin up an ephemeral Postgres container via
testcontainers).

```
npm test
```

Covered: crypto round-trip, AAD binding, recipient isolation, token /
OTP expiry, check-in reset, deletion timing.
