export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    if (process.env.LAST_PING_DISABLE_JOBS === "1") return;
    const { startScheduler } = await import("@/server/jobs/scheduler");
    await startScheduler();
  }
}
