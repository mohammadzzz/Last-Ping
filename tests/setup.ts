import crypto from "node:crypto";

// Minimum env for tests that don't touch DB / network.
(process.env as Record<string, string>).NODE_ENV = "test";
process.env.APP_URL ??= "http://localhost:3000";
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.DATA_DIR ??= "/tmp/last-ping-test";
process.env.MASTER_KEK ??= crypto.randomBytes(32).toString("base64");
process.env.AUTH_PEPPER ??= "test-pepper-minimum-length";
process.env.SESSION_SECRET ??= crypto.randomBytes(48).toString("base64");
process.env.IP_HASH_SALT ??= "test-ip-salt";
