# Last Ping — Product Requirements

## Purpose
A private, self-hosted dead-man's-switch for personal media. The owner
checks in on a schedule. If they stop checking in, the system sends
pre-prepared messages and files to specific recipients.

This is **not** a legal will and does not attempt to satisfy estate law.
It is strictly a private delivery system.

## Primary user
One owner, running the app on their home server behind HTTPS.

## Recipients
Anywhere from a handful to ~20 people. The owner has their contact
details (email, phone, Telegram chat id). Recipients never log in and do
not have accounts; they receive a one-time link and verify with a code
sent to an out-of-band channel.

## Golden path (owner)
1. Owner visits `/login`, enters password + TOTP.
2. Dashboard shows: current state (ACTIVE / WARNING / RELEASED), last
   check-in timestamp, countdown to warning, countdown to release.
3. Owner clicks **I'm alive** → message: *"You're checked in. Nothing
   will be sent."* The countdown resets.
4. Off-path owner can also visit their stored check-in link, enter PIN,
   see the same message. No login needed.

## Golden path (recipient)
1. After release, recipient receives a link via every configured
   channel. Opens it.
2. Page says: *"A message is waiting for you. We'll send you a one-time
   code."* Recipient clicks **Send code**.
3. Code arrives via email (default) or SMS (if configured).
4. Recipient enters code → sees personal message + one **Download ZIP**
   button.
5. After full download, ZIP stays available for 3 more days, then is
   deleted. Original encrypted blobs are never auto-deleted.

## State machine
- **ACTIVE** → default.
- Age ≥ `WARNING_AFTER_SECONDS` → **WARNING**; daily warning fanned out
  across the owner's configured channels until either check-in or
  release.
- Age ≥ `RELEASE_AFTER_SECONDS` → **RELEASED**; per-recipient tokens
  minted, links sent, countdown frozen.
- Check-in (login or check-in link) → resets to **ACTIVE**, clears
  `warningStartedAt`.

## Retention
- Undownloaded release: 30 days, then expired and ZIP deleted.
- Downloaded release: ZIP kept 3 days after last completed download.
- Delivery logs: kept forever (they are small).
- Original encrypted files: owner-managed only; no job ever deletes
  them.

## Test mode
A single global toggle, guarded by TOTP reconfirm. In test mode:
- Jobs run on an accelerated clock (`TEST_MODE_SPEEDUP` multiplier on
  time-since-last-checkin).
- `simulate-warning` and `simulate-release` buttons fire the
  corresponding flows now.
- Test releases only include files flagged `isSample=true` and only
  notify the owner's contacts — recipients are not messaged.

## Non-goals (MVP)
- Multi-owner.
- Legal/estate integration.
- Mobile apps.
- WebAuthn/hardware tokens.
- In-browser preview of media.
- Shamir-split / escrow of the master key.

## Success criteria
- A recipient can successfully receive and decrypt a ZIP end-to-end in a
  simulated release using the owner's personal email.
- The 4 required automated tests pass on every commit.
- Owner can check in via either login or PIN link and see the exact
  "nothing will be sent" message.
