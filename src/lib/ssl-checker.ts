import * as tls from "tls";

export interface SslResult {
  expiresAt: Date;
  issuer: string;
  daysRemaining: number;
  error?: string;
}

const CONNECTION_TIMEOUT = 10_000;

export function checkSslCertificate(hostname: string): Promise<SslResult | null> {
  return new Promise((resolve) => {
    const socket = tls.connect(
      { host: hostname, port: 443, servername: hostname, rejectUnauthorized: false },
      () => {
        try {
          const cert = socket.getPeerCertificate();
          if (!cert || !cert.valid_to) {
            socket.destroy();
            resolve(null);
            return;
          }

          const expiresAt = new Date(cert.valid_to);
          const daysRemaining = Math.floor(
            (expiresAt.getTime() - Date.now()) / 86_400_000
          );
          const issuer =
            cert.issuer?.O || cert.issuer?.CN || "Unknown";

          socket.destroy();
          resolve({ expiresAt, issuer, daysRemaining });
        } catch (err) {
          socket.destroy();
          resolve({
            expiresAt: new Date(0),
            issuer: "Unknown",
            daysRemaining: -1,
            error: err instanceof Error ? err.message : "Certificate parse error",
          });
        }
      }
    );

    socket.setTimeout(CONNECTION_TIMEOUT, () => {
      socket.destroy();
      resolve({
        expiresAt: new Date(0),
        issuer: "Unknown",
        daysRemaining: -1,
        error: `TLS connection timed out after ${CONNECTION_TIMEOUT / 1000}s`,
      });
    });

    socket.on("error", (err) => {
      socket.destroy();
      resolve({
        expiresAt: new Date(0),
        issuer: "Unknown",
        daysRemaining: -1,
        error: err.message,
      });
    });
  });
}

export function extractHostname(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return null;
    return parsed.hostname;
  } catch {
    return null;
  }
}
