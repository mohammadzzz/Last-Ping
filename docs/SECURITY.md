# Security architecture

## Threat model
**In scope**
- Random internet attackers probing exposed endpoints.
- A curious recipient trying to reach another recipient's files or
  message.
- A stolen / leaked download link.
- Accidental premature release.

**Out of scope**
- Physical seizure of the server with the KEK in memory / env.
- Nation-state adversary with TLS-interception capability.
- Supply-chain compromise of upstream npm dependencies (trusted via
  lockfile).

## Key hierarchy
1. **MASTER_KEK** — 32 random bytes, base64 in the environment. Never
   written to disk by the app. Losing it is equivalent to losing every
   file's plaintext.
2. **DEK** (per file) — 32 random bytes generated on upload. Used with
   AES-256-GCM with a per-file random nonce to encrypt the stream to
   `/data/files/<uuid>.enc`.
3. **Wrapped DEK** — stored in `MediaFile.wrappedDek`. AES-256-GCM with
   the KEK, AAD = `file:<file_id>`. The file id binding prevents a
   swapped-wrappedDek attack.

## Owner authentication
- Password + TOTP. Passwords hashed with **argon2id** (64 MiB / t=3) and
  a server-side pepper (`AUTH_PEPPER` env).
- TOTP secret encrypted at rest with KEK, AAD `owner:<id>:totp`.
- Sessions via `iron-session` cookies, HttpOnly + Secure + SameSite=Lax.
  Separate cookies for owner vs recipient (`lp_owner`, `lp_recipient`).

## Check-in link
- Opaque, high-entropy token (`Owner.checkinLinkToken`).
- Page requires a **separate PIN** (also argon2id-hashed) — possessing
  the URL alone is not sufficient.
- Rate-limited per IP hash and per token prefix.

## Recipient flow
- Per release-recipient token: 32 random bytes, URL-safe. Stored as
  SHA-256 hash (`ReleaseRecipient.downloadTokenHash`).
- Landing `/r/<token>` never reveals message contents. Sends OTP via
  preferred channel.
- OTP is argon2id-hashed, 10-min TTL, max 5 verify attempts before
  rate-limit lockout.
- On success, server sets a short (2h) recipient cookie bound to the
  specific `releaseRecipientId`. **Every subsequent route re-checks
  that the cookie's recipient id matches the one resolved from the URL
  token** — token alone is never trusted after verification.

## Isolation
- All recipient DB reads go through `src/server/guards/require-recipient.ts`.
- ZIP generation pulls files from `mediaFile.findMany({ where: {
  assignments: { some: { recipientId } } } })` — no code path accepts a
  file id from the client.
- File paths never leak to the client. `storagePathForId` enforces a
  UUID format and rejects anything that resolves outside the files dir.

## Rate limiting
Postgres-backed sliding window + lockout (`RateLimitBucket`). Policies
defined in `src/server/rate-limit.ts`. Covers:
- Owner login.
- Check-in link PIN submit.
- OTP send.
- OTP verify attempt.

## Logging
- `AuditLog` captures owner actions, system transitions, recipient
  verification events. No plaintext tokens or OTP codes are ever
  logged; only hashes / prefixes.
- `NotificationAttempt` records provider responses and failures per
  channel.

## Incident response
See `RUNBOOK.md` for the *operational* procedures. In summary:
- **KEK leaked**: rotate immediately (see RUNBOOK), re-wrap all DEKs,
  revoke and re-issue sessions.
- **False-positive release** (you're alive but release fired): check in
  immediately to stop future sends, mark affected `ReleaseRecipient`s
  as EXPIRED, manually notify recipients.
- **Database leak**: content is still protected by KEK, but wrapped
  DEKs and hashed download-tokens leaked. Rotate KEK and regenerate
  tokens.
