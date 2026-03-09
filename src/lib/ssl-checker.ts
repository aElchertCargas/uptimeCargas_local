import { spawn } from "node:child_process";
import { isIP } from "node:net";

export interface SslResult {
  expiresAt: Date;
  issuer: string;
  daysRemaining: number;
  error?: string;
}

export interface SslTarget {
  host: string;
  port: number;
  servername?: string;
  displayName: string;
}

const CONNECTION_TIMEOUT = 10_000;
const OPENSSL_COMMAND = "openssl";
const OPENSSL_MISSING_ERROR =
  "OpenSSL CLI is not installed or not available on PATH";

export async function checkSslCertificate(
  target: SslTarget
): Promise<SslResult | null> {
  try {
    const output = await readCertificateWithOpenSsl(target);
    const expiresAt = extractExpiryDate(output);

    if (!expiresAt) {
      throw new Error(
        `OpenSSL did not return a parseable certificate expiry for ${target.displayName}`
      );
    }

    const daysRemaining = Math.floor(
      (expiresAt.getTime() - Date.now()) / 86_400_000
    );

    return {
      expiresAt,
      issuer: extractIssuer(output),
      daysRemaining,
    };
  } catch (err) {
    return {
      expiresAt: new Date(0),
      issuer: "Unknown",
      daysRemaining: -1,
      error: err instanceof Error ? err.message : "Certificate parse error",
    };
  }
}

function readCertificateWithOpenSsl(target: SslTarget): Promise<string> {
  return new Promise((resolve, reject) => {
    const sClientArgs = [
      "s_client",
      "-connect",
      formatConnectTarget(target.host, target.port),
      "-showcerts",
    ];

    if (target.servername) {
      sClientArgs.splice(1, 0, "-servername", target.servername);
    }

    const sClient = spawn(OPENSSL_COMMAND, sClientArgs, {
      stdio: ["pipe", "pipe", "pipe"],
    });
    const x509 = spawn(
      OPENSSL_COMMAND,
      ["x509", "-noout", "-enddate", "-issuer"],
      { stdio: ["pipe", "pipe", "pipe"] }
    );

    let settled = false;
    let output = "";
    let sClientError = "";
    let x509Error = "";
    let sClientExitCode: number | null = null;
    let x509ExitCode: number | null = null;

    const finish = (result: string | Error) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeoutId);

      sClient.stdout.unpipe(x509.stdin);
      terminateIfRunning(sClient);
      terminateIfRunning(x509);
      x509.stdin.destroy();

      if (result instanceof Error) {
        reject(result);
        return;
      }

      resolve(result);
    };

    const finalizeIfComplete = () => {
      if (sClientExitCode === null || x509ExitCode === null) {
        return;
      }

      if (x509ExitCode === 0 && output.trim()) {
        finish(output);
        return;
      }

      finish(
        new Error(
          normalizeOpenSslError(
            sClientError,
            x509Error,
            `OpenSSL did not return a certificate for ${target.displayName}`
          )
        )
      );
    };

    const timeoutId = setTimeout(() => {
      finish(
        new Error(
          `OpenSSL connection timed out after ${CONNECTION_TIMEOUT / 1000}s`
        )
      );
    }, CONNECTION_TIMEOUT);

    sClient.on("error", (err) => {
      finish(new Error(normalizeSpawnError(err)));
    });

    x509.on("error", (err) => {
      finish(new Error(normalizeSpawnError(err)));
    });

    sClient.stderr.on("data", (chunk: Buffer | string) => {
      sClientError += chunk.toString();
    });

    x509.stderr.on("data", (chunk: Buffer | string) => {
      x509Error += chunk.toString();
    });

    x509.stdout.on("data", (chunk: Buffer | string) => {
      output += chunk.toString();
    });

    x509.stdin.on("error", () => {
      // x509 may exit before s_client finishes writing when the handshake fails.
    });

    sClient.stdout.pipe(x509.stdin);
    sClient.stdin.end("\n");

    sClient.on("close", (code) => {
      sClientExitCode = code;
      finalizeIfComplete();
    });

    x509.on("close", (code) => {
      x509ExitCode = code;
      finalizeIfComplete();
    });
  });
}

export function parseSslTarget(url: string): SslTarget | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") {
      return null;
    }

    const host = parsed.hostname;
    const port = parsed.port ? Number.parseInt(parsed.port, 10) : 443;

    if (!host || Number.isNaN(port) || port < 1 || port > 65535) {
      return null;
    }

    return {
      host,
      port,
      servername: isIP(host) === 0 ? host : undefined,
      displayName: parsed.port ? formatConnectTarget(host, port) : host,
    };
  } catch {
    return null;
  }
}

function extractExpiryDate(output: string): Date | null {
  const match = output.match(/^notAfter=(.+)$/m);
  if (!match) {
    return null;
  }

  const expiresAt = new Date(match[1].trim());
  return Number.isNaN(expiresAt.getTime()) ? null : expiresAt;
}

function extractIssuer(output: string): string {
  const match = output.match(/^issuer=(.+)$/m);
  if (!match) {
    return "Unknown";
  }

  const issuer = match[1].trim();
  const organization = issuer.match(/(?:^|,|\/)\s*O\s*=\s*([^,\/]+)/);
  if (organization?.[1]) {
    return organization[1].trim();
  }

  const commonName = issuer.match(/(?:^|,|\/)\s*CN\s*=\s*([^,\/]+)/);
  if (commonName?.[1]) {
    return commonName[1].trim();
  }

  return issuer || "Unknown";
}

function formatConnectTarget(host: string, port: number): string {
  if (host.includes(":") && !host.startsWith("[") && !host.endsWith("]")) {
    return `[${host}]:${port}`;
  }

  return `${host}:${port}`;
}

function normalizeSpawnError(err: NodeJS.ErrnoException): string {
  if (err.code === "ENOENT") {
    return OPENSSL_MISSING_ERROR;
  }

  return err.message;
}

function normalizeOpenSslError(
  sClientError: string,
  x509Error: string,
  fallback: string
): string {
  const message = [x509Error, sClientError]
    .flatMap((value) => value.split("\n"))
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1);

  if (!message) {
    return fallback;
  }

  return message === "Could not read certificate from <stdin>"
    ? fallback
    : message;
}

function terminateIfRunning(
  process: ReturnType<typeof spawn>
): void {
  if (process.exitCode === null && process.signalCode === null) {
    process.kill("SIGKILL");
  }
}
