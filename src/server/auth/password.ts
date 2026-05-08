import argon2 from "argon2";
import { env } from "@/lib/env";

const OPTS = {
  type: argon2.argon2id,
  memoryCost: 64 * 1024, // 64 MiB
  timeCost: 3,
  parallelism: 1,
} as const;

export async function hashSecret(plain: string): Promise<string> {
  return argon2.hash(plain + env().AUTH_PEPPER, OPTS);
}

export async function verifySecret(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain + env().AUTH_PEPPER);
  } catch {
    return false;
  }
}
