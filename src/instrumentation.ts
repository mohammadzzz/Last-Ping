export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.LAST_PING_DISABLE_JOBS === "1") return;

  // Dynamic path prevents webpack from resolving the scheduler module
  // when compiling instrumentation for Edge runtime (middleware context).
  const mod = "./server/jobs/scheduler";
  const { startScheduler } = await import(/* webpackIgnore: true */ mod);
  await startScheduler();
}
