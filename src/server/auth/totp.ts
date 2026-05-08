import { authenticator } from "otplib";
import QRCode from "qrcode";

authenticator.options = { window: 1, step: 30 };

export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

export function totpUri(email: string, secret: string): string {
  return authenticator.keyuri(email, "Last Ping", secret);
}

export async function totpQrDataUrl(email: string, secret: string): Promise<string> {
  return QRCode.toDataURL(totpUri(email, secret));
}

export function verifyTotp(secret: string, token: string): boolean {
  try {
    return authenticator.verify({ token: token.replace(/\s+/g, ""), secret });
  } catch {
    return false;
  }
}
