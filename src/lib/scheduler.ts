let schedulerRunning = false;
let checkIntervalId: ReturnType<typeof setInterval> | null = null;
let cleanupIntervalId: ReturnType<typeof setInterval> | null = null;

const CHECK_INTERVAL_MS = 60_000;
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

function getBaseUrl() {
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return `http://localhost:${process.env.PORT || 3000}`;
}

async function runCheckCycle() {
  try {
    await fetch(`${getBaseUrl()}/api/cron/check`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET || ""}` },
    });
  } catch {
    // Retry next cycle
  }
}

async function runCleanup() {
  try {
    await fetch(`${getBaseUrl()}/api/cron/cleanup`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET || ""}` },
    });
  } catch {
    // Retry next day
  }
}

export function startScheduler() {
  if (schedulerRunning) return;
  schedulerRunning = true;

  setTimeout(runCheckCycle, 5_000);

  checkIntervalId = setInterval(runCheckCycle, CHECK_INTERVAL_MS);
  cleanupIntervalId = setInterval(runCleanup, CLEANUP_INTERVAL_MS);

  console.log(`[scheduler] Started — checks every ${CHECK_INTERVAL_MS / 1000}s, cleanup every 24h`);
}

export function stopScheduler() {
  if (checkIntervalId) clearInterval(checkIntervalId);
  if (cleanupIntervalId) clearInterval(cleanupIntervalId);
  checkIntervalId = null;
  cleanupIntervalId = null;
  schedulerRunning = false;
}

export function isSchedulerRunning() {
  return schedulerRunning;
}
