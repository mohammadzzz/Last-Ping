# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev               # Next.js dev server
npm run build             # Production build
npm run lint              # ESLint
npm run typecheck         # tsc --noEmit
npm run prisma:generate   # Regenerate Prisma client after schema changes
npm run prisma:migrate    # Run dev migrations
npm run prisma:deploy     # Apply migrations in production
npm run bootstrap         # One-time owner setup (creates Owner row, prints check-in link + TOTP QR)
npm test                  # Full test suite (requires Docker for Testcontainers)
npm run test:watch        # Vitest watch mode
```

Run a single test file: `npx vitest run tests/unit/crypto.test.ts`
Run by name: `npx vitest run --reporter=verbose -t "test name here"`

Tests spin up a real `postgres:16-alpine` container via Testcontainers — Docker must be running.

## Architecture

**Last Ping** is a self-hosted dead man's switch: if the owner stops checking in, encrypted files and messages are released to pre-configured recipients via one-time secure download links.

### Core State Machine

`AppState.mode` drives everything:
- `ACTIVE` → owner is checking in regularly
- `WARNING` → no check-in for `WARNING_AFTER_SECONDS` (default 7 days); daily warnings sent to owner
- `RELEASED` → no check-in for `RELEASE_AFTER_SECONDS` (default 14 days); one-time download tokens minted and distributed to recipients

State transitions happen in `src/server/jobs/inactivity-check.ts`. A check-in (via `/login` session or `/checkin/[token]` PIN link) resets to `ACTIVE`.

### Key Layers

- **`src/app/api/`** — Next.js App Router API routes (REST). Auth routes, check-in, file/recipient/assignment CRUD, recipient download flow (`r/[token]`), test-mode controls.
- **`src/server/`** — All server-side logic:
  - `db.ts` — lazy Prisma singleton; `setPrismaForTesting()` hook for tests
  - `state.ts` — `getStateView()`, `effectiveAgeSeconds()` read helpers
  - `crypto/` — AES-256-GCM stream cipher (`stream-cipher.ts`) + KEK envelope wrapping (`kek.ts`); AAD-bound to prevent cross-context reuse
  - `jobs/` — node-cron scheduler with `pg_advisory_lock` (multi-instance safe); individual jobs: inactivity check, daily warnings, recipient reminders, expire undownloaded, execute deletions
  - `notifications/` — fan-out to Resend (email), Telegram, Twilio (SMS/WhatsApp)
  - `storage/files.ts` — encrypt-to-disk / streaming decrypt; `storage/zip.ts` builds recipient ZIP via archiver
  - `auth/` — iron-session, argon2 password/PIN, otplib TOTP, CSRF
  - `guards/` — `requireOwner` / `requireRecipient` middleware helpers
- **`src/lib/env.ts`** — Zod-validated env singleton; all env vars flow through here
- **`src/lib/clock.ts`** — injectable clock; use `setClockForTesting()` in tests instead of mocking `Date`
- **`src/instrumentation.ts`** — Next.js instrumentation hook that starts the scheduler on server boot; disable with `LAST_PING_DISABLE_JOBS=1`

### Testing Patterns

- `tests/helpers/db.ts` — shared Testcontainers PostgreSQL singleton + `resetDb()` (truncates all tables between tests)
- `tests/setup.ts` — injects minimum required env vars before any test runs
- Clock and Prisma client are both injectable for tests — prefer `setClockForTesting` / `setPrismaForTesting` over module mocks

### Encryption Model

Files encrypted at rest with per-file AES-256-GCM keys, wrapped with master KEK (`MASTER_KEK` env var). KEK unwrap uses AAD binding to prevent key reuse across contexts.

### Docker / Deployment

- `Dockerfile` — multi-stage, node:22-alpine, `standalone` Next.js output
- `docker-compose.yml` — local dev stack (app + PostgreSQL 16)
- Production: runs behind HTTPS on a home server; `DATA_DIR` holds encrypted file blobs
