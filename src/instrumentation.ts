export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Load the scheduler only in the Node runtime because it depends on Prisma
    // and OpenSSL-backed server code that should never be bundled for Edge.
    const { startScheduler } = await import("@/lib/scheduler");
    startScheduler();
  }
}
