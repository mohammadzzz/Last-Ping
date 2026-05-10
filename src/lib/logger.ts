import pino from "pino";
import { env } from "@/lib/env";

const root = pino({ level: env().LOG_LEVEL });

export function createLogger(name: string) {
  return root.child({ name });
}

export const logger = root;
