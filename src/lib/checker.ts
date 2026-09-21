import { safeFetch } from "@/lib/safe-fetch";

export interface CheckResult {
  status: number;
  responseTime: number;
  isUp: boolean;
  message: string | null;
}

async function singleCheck(
  url: string,
  method: string,
  timeout: number,
  expectedStatuses: number[]
): Promise<CheckResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout * 1000);
  const start = performance.now();

  try {
    const response = await safeFetch(url, {
      method,
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "UptimeCargas/1.0",
      },
    });

    const responseTime = Math.round(performance.now() - start);
    const isUp = expectedStatuses.includes(response.status);

    return {
      status: response.status,
      responseTime,
      isUp,
      message: isUp
        ? null
        : `Expected ${expectedStatuses.join("/")}, got ${response.status}`,
    };
  } catch (error) {
    const responseTime = Math.round(performance.now() - start);
    const message =
      error instanceof DOMException && error.name === "AbortError"
        ? `Timeout after ${timeout}s`
        : error instanceof Error
          ? error.message
          : "Unknown error";

    return {
      status: 0,
      responseTime,
      isUp: false,
      message,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

const FIRST_ATTEMPT_TIMEOUT = 10;
const RETRY_DELAY_MS = 2000;

export async function performCheck(
  url: string,
  method: string = "GET",
  timeout: number = 48,
  expectedStatuses: number[] = [200, 401],
  maxRetries: number = 3
): Promise<CheckResult> {
  let lastResult: CheckResult | null = null;

  const attempts = Math.max(1, Math.floor(maxRetries));
  for (let attempt = 0; attempt < attempts; attempt++) {
    const attemptTimeout = attempt === 0 ? Math.min(FIRST_ATTEMPT_TIMEOUT, timeout) : timeout;
    lastResult = await singleCheck(url, method, attemptTimeout, expectedStatuses);
    if (lastResult.isUp) return lastResult;

    if (attempt < attempts - 1) {
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    }
  }

  return lastResult ?? {
    status: 0,
    responseTime: 0,
    isUp: false,
    message: "No check attempts were configured",
  };
}

export async function runChecksInBatches<T>(
  items: T[],
  fn: (item: T) => Promise<void>,
  concurrency: number = 50
): Promise<void> {
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const item = items[nextIndex++];
      if (item !== undefined) await fn(item);
    }
  });
  await Promise.all(workers);
}
