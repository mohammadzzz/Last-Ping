import cron, { type ScheduledTask } from "node-cron";
import pino from "pino";
import { prisma } from "@/server/db";
import { runInactivityCheck } from "./inactivity-check";
import { runDailyWarnings } from "./daily-warnings";
import { runRecipientReminders } from "./recipient-reminders";
import { runExpireUndownloaded } from "./expire-undownloaded";
import { runExecuteDeletions } from "./execute-deletions";

const log = pino({ name: "scheduler" });

let started = false;
const tasks: ScheduledTask[] = [];

interface JobDef {
  id: number;          // stable numeric for pg_advisory_lock
  name: string;
  cron: string;        // live schedule
  testCron: string;    // accelerated schedule
  run: () => Promise<void>;
}

const JOBS: JobDef[] = [
  { id: 101, name: "inactivity-check",   cron: "*/15 * * * *", testCron: "*/15 * * * * *", run: runInactivityCheck },
  { id: 102, name: "daily-warnings",     cron: "0 * * * *",    testCron: "* * * * *",      run: runDailyWarnings },
  { id: 103, name: "recipient-reminders",cron: "0 9 * * *",    testCron: "*/2 * * * *",    run: runRecipientReminders },
  { id: 104, name: "expire-undownloaded",cron: "0 3 * * *",    testCron: "*/5 * * * *",    run: runExpireUndownloaded },
  { id: 105, name: "execute-deletions",  cron: "*/10 * * * *", testCron: "*/1 * * * *",    run: runExecuteDeletions },
];

async function withAdvisoryLock<T>(lockId: number, fn: () => Promise<T>): Promise<T | undefined> {
  const rows = await prisma.$queryRaw<{ locked: boolean }[]>`
    SELECT pg_try_advisory_lock(${lockId}::bigint) AS locked
  `;
  if (!rows[0]?.locked) return undefined;
  try {
    return await fn();
  } finally {
    await prisma.$queryRaw`SELECT pg_advisory_unlock(${lockId}::bigint)`;
  }
}

async function isTestMode(): Promise<boolean> {
  const s = await prisma.appState.findUnique({ where: { id: 1 } });
  return !!s?.testMode;
}

export async function startScheduler() {
  if (started) return;
  started = true;
  log.info("scheduler starting");

  // In test mode we want the accelerated cron strings, so we restart the
  // scheduler when the toggle flips. We keep a tiny periodic check for that.
  let lastTest = await isTestMode();

  const register = (mode: "live" | "test") => {
    for (const t of tasks) t.stop();
    tasks.length = 0;
    for (const j of JOBS) {
      const expr = mode === "test" ? j.testCron : j.cron;
      const t = cron.schedule(expr, async () => {
        await withAdvisoryLock(j.id, async () => {
          try {
            await j.run();
          } catch (err) {
            log.error({ err, job: j.name }, "job failed");
          }
        });
      });
      tasks.push(t);
    }
    log.info({ mode, jobs: JOBS.map((j) => j.name) }, "scheduler registered");
  };

  register(lastTest ? "test" : "live");

  // Poll the testMode flag every 15s to switch schedules without a restart.
  setInterval(async () => {
    const t = await isTestMode().catch(() => lastTest);
    if (t !== lastTest) {
      lastTest = t;
      register(t ? "test" : "live");
    }
  }, 15_000).unref();
}
