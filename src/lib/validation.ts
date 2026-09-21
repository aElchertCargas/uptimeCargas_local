const ALLOWED_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function normalizeMonitorUrl(url: string) {
  const parsed = new URL(url.trim());
  parsed.hash = "";
  return parsed.toString().replace(/\/+$/, "").toLowerCase();
}

export function validateMonitorInput(input: Record<string, unknown>) {
  if (typeof input.name !== "string" || !input.name.trim()) {
    throw new Error("Monitor name is required");
  }
  if (typeof input.url !== "string") {
    throw new Error("Monitor URL is required");
  }

  const url = new URL(input.url);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Monitor URL must use HTTP or HTTPS");
  }

  const method = String(input.method ?? "GET").toUpperCase();
  if (!ALLOWED_METHODS.has(method)) {
    throw new Error("Monitor method must be GET, HEAD, or OPTIONS");
  }

  const interval = Number(input.interval ?? 120);
  const timeout = Number(input.timeout ?? 48);
  const maxRetries = Number(input.maxRetries ?? 3);
  if (!Number.isInteger(interval) || interval < 10 || interval > 86_400) {
    throw new Error("Interval must be between 10 seconds and 24 hours");
  }
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > 120) {
    throw new Error("Timeout must be between 1 and 120 seconds");
  }
  if (!Number.isInteger(maxRetries) || maxRetries < 1 || maxRetries > 10) {
    throw new Error("Retries must be between 1 and 10");
  }

  const expectedStatus = Array.isArray(input.expectedStatus)
    ? input.expectedStatus
    : [input.expectedStatus ?? 200];
  if (
    expectedStatus.length === 0 ||
    expectedStatus.some(
      (status) => !Number.isInteger(status) || Number(status) < 100 || Number(status) > 599
    )
  ) {
    throw new Error("Expected statuses must be valid HTTP status codes");
  }

  return {
    name: input.name.trim(),
    url: input.url.trim(),
    normalizedUrl: normalizeMonitorUrl(input.url),
    method,
    interval,
    timeout,
    maxRetries,
    expectedStatus,
    active: input.active !== false,
    tags: Array.isArray(input.tags) ? input.tags.filter((tag) => typeof tag === "string") : [],
  };
}
