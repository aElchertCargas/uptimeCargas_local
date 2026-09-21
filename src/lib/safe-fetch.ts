import dns from "node:dns/promises";
import net from "node:net";

const MAX_REDIRECTS = 3;
const DEFAULT_TIMEOUT_MS = 30_000;

function isPrivateIpv4(address: string) {
  const [a, b] = address.split(".").map(Number);
  return (
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a === 0
  );
}

function isPrivateIpv6(address: string) {
  const normalized = address.toLowerCase();
  return (
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb")
  );
}

async function assertSafeUrl(input: string) {
  const url = new URL(input);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Only HTTP and HTTPS URLs are supported");
  }

  const hostname = url.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname === "metadata.google.internal"
  ) {
    throw new Error("Private or metadata hosts are not allowed");
  }

  const addresses =
    process.env.NODE_ENV === "test"
      ? []
      : net.isIP(hostname) > 0
        ? [hostname]
        : (await dns.lookup(hostname, { all: true })).map((entry) => entry.address);

  if (
    addresses.some((address) =>
      net.isIPv4(address) ? isPrivateIpv4(address) : isPrivateIpv6(address)
    )
  ) {
    throw new Error("Private or metadata hosts are not allowed");
  }

  return url;
}

export async function safeFetch(
  input: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS
) {
  let currentUrl = input;

  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect++) {
    await assertSafeUrl(currentUrl);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const signal = init.signal
      ? AbortSignal.any([init.signal, controller.signal])
      : controller.signal;

    try {
      const response = await fetch(currentUrl, {
        ...init,
        redirect: "manual",
        signal,
      });

      if (response.status < 300 || response.status >= 400) {
        return response;
      }

      const location = response.headers.get("location");
      if (!location || redirect === MAX_REDIRECTS) {
        throw new Error("Too many or invalid redirects");
      }
      currentUrl = new URL(location, currentUrl).toString();
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw new Error("Too many redirects");
}
