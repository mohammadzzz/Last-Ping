/**
 * One-time CLI to create the single owner row.
 * Usage: npm run bootstrap
 *
 * Prompts for owner email, login password, and check-in PIN.
 * Prints the check-in link and TOTP QR once — save them in a password manager.
 */
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { PrismaClient } from "@prisma/client";
import { hashSecret } from "../src/server/auth/password";
import { generateTotpSecret, totpQrDataUrl, totpUri } from "../src/server/auth/totp";
import { wrapString } from "../src/server/crypto/kek";
import { randomToken } from "../src/server/crypto/tokens";
import { env } from "../src/lib/env";

async function main() {
  const prisma = new PrismaClient();
  const existing = await prisma.owner.count();
  if (existing > 0) {
    console.error("An owner already exists. Refusing to bootstrap.");
    process.exit(2);
  }

  const rl = readline.createInterface({ input, output });
  const email = (await rl.question("Owner email: ")).trim();
  const password = await rl.question("Login password (min 12 chars): ");
  if (password.length < 12) {
    console.error("Password too short.");
    process.exit(2);
  }
  const pin = await rl.question("Check-in PIN (min 6 chars, distinct from password): ");
  if (pin.length < 6) {
    console.error("PIN too short.");
    process.exit(2);
  }
  if (pin === password) {
    console.error("PIN must differ from password.");
    process.exit(2);
  }
  rl.close();

  const ownerId = crypto.randomUUID();
  const totpSecret = generateTotpSecret();
  const checkinLinkToken = randomToken(32);
  const [passwordHash, pinHash] = await Promise.all([hashSecret(password), hashSecret(pin)]);

  await prisma.owner.create({
    data: {
      id: ownerId,
      email,
      passwordHash,
      checkinPinHash: pinHash,
      checkinLinkToken,
      totpSecretEnc: wrapString(totpSecret, `owner:${ownerId}:totp`),
      totpEnrolled: false,
    },
  });

  await prisma.appState.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, mode: "ACTIVE", lastCheckinAt: new Date() },
  });

  const qr = await totpQrDataUrl(email, totpSecret);
  const appUrl = env().APP_URL.replace(/\/$/, "");

  console.log("\n==== SAVE THESE IN A PASSWORD MANAGER (shown only once) ====\n");
  console.log("Check-in link:");
  console.log(`  ${appUrl}/checkin/${checkinLinkToken}`);
  console.log("\nTOTP secret (otpauth URI):");
  console.log(`  ${totpUri(email, totpSecret)}`);
  console.log("\nTOTP QR (base64 data URL — paste into a browser):");
  console.log(`  ${qr}`);
  console.log("\n============================================================\n");
  console.log("Next: visit /login, sign in, then complete /totp-setup.");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
