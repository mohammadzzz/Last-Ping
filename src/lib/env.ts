import { z } from "zod";

const b64Min32 = z
  .string()
  .min(1, "required")
  .refine((s) => {
    try {
      return Buffer.from(s, "base64").length >= 32;
    } catch {
      return false;
    }
  }, "must decode to >= 32 bytes");

const emptyToUndef = <T extends z.ZodTypeAny>(s: T) =>
  z.preprocess((v) => (v === "" ? undefined : v), s);

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  APP_URL: z.string().url(),
  PORT: z.coerce.number().int().positive().default(3000),

  DATABASE_URL: z.string().min(1),
  DATA_DIR: z.string().min(1).default("/data"),

  MASTER_KEK: b64Min32,
  AUTH_PEPPER: z.string().min(16),
  SESSION_SECRET: z.string().min(32),
  IP_HASH_SALT: z.string().min(8),

  WARNING_AFTER_SECONDS: z.coerce.number().int().positive().default(7 * 86400),
  RELEASE_AFTER_SECONDS: z.coerce.number().int().positive().default(14 * 86400),
  RECIPIENT_EXPIRY_SECONDS: z.coerce.number().int().positive().default(30 * 86400),
  POST_DOWNLOAD_RETENTION_SECONDS: z.coerce.number().int().positive().default(3 * 86400),
  TEST_MODE_SPEEDUP: z.coerce.number().int().positive().default(3600),

  RESEND_API_KEY: emptyToUndef(z.string().optional()),
  RESEND_FROM_EMAIL: emptyToUndef(z.string().email().optional()),

  TELEGRAM_BOT_TOKEN: emptyToUndef(z.string().optional()),
  TELEGRAM_OWNER_CHAT_ID: emptyToUndef(z.string().optional()),

  TWILIO_ACCOUNT_SID: emptyToUndef(z.string().optional()),
  TWILIO_AUTH_TOKEN: emptyToUndef(z.string().optional()),
  TWILIO_FROM_SMS: emptyToUndef(z.string().optional()),
  TWILIO_FROM_WHATSAPP: emptyToUndef(z.string().optional()),

  OWNER_WARNING_CHANNELS: z
    .string()
    .default("EMAIL")
    .transform((s) =>
      s
        .split(",")
        .map((x) => x.trim().toUpperCase())
        .filter(Boolean),
    ),
  OWNER_CONTACT_EMAIL: emptyToUndef(z.string().email().optional()),
  OWNER_CONTACT_PHONE: emptyToUndef(z.string().optional()),
  OWNER_CONTACT_WHATSAPP: emptyToUndef(z.string().optional()),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}
