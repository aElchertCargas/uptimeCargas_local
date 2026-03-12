let schedulerRunning = false;
let checkIntervalId: ReturnType<typeof setInterval> | null = null;

const CHECK_INTERVAL_MS = 60_000;

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

export function startScheduler() {
  if (schedulerRunning) return;
  schedulerRunning = true;

  // Keep the main monitor loop inside the always-on Railway web instance.
  setTimeout(runCheckCycle, 5_000);

  checkIntervalId = setInterval(runCheckCycle, CHECK_INTERVAL_MS);

  console.log(
    `[scheduler] Started internal monitor checks every ${CHECK_INTERVAL_MS / 1000}s`
  );
}

export function stopScheduler() {
  if (checkIntervalId) clearInterval(checkIntervalId);
  checkIntervalId = null;
  schedulerRunning = false;
}

export function isSchedulerRunning() {
  return schedulerRunning;
}
