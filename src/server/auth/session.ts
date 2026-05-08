import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

export interface OwnerSession {
  ownerId?: string;
  loggedInAt?: number;
  csrfToken?: string;
}

export interface RecipientSession {
  releaseRecipientId?: string;
  recipientId?: string;
  verifiedAt?: number;
}

const baseCookie = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

export function ownerSessionOptions(): SessionOptions {
  return {
    password: env().SESSION_SECRET,
    cookieName: "lp_owner",
    cookieOptions: { ...baseCookie, maxAge: 60 * 60 * 8 }, // 8h
  };
}

export function recipientSessionOptions(): SessionOptions {
  return {
    password: env().SESSION_SECRET,
    cookieName: "lp_recipient",
    cookieOptions: { ...baseCookie, maxAge: 60 * 60 * 2 }, // 2h
  };
}

export async function getOwnerSession() {
  return getIronSession<OwnerSession>(await cookies(), ownerSessionOptions());
}

export async function getRecipientSession() {
  return getIronSession<RecipientSession>(await cookies(), recipientSessionOptions());
}
