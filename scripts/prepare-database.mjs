import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

function normalizeUrl(value) {
  const url = new URL(value.trim());
  url.hash = "";
  return url.toString().replace(/\/+$/, "").toLowerCase();
}

async function main() {
  const client = await pool.connect();

  try {
    console.log("[database] Verifying application schema");
    await client.query("BEGIN");

    const tableResult = await client.query(`SELECT to_regclass('"Monitor"') AS table_name`);
    if (!tableResult.rows[0]?.table_name) {
      await client.query("COMMIT");
      console.log("[database] Monitor table does not exist yet; Prisma will create it");
      return;
    }

    await client.query(`
      ALTER TABLE "Monitor"
        ADD COLUMN IF NOT EXISTS "normalizedUrl" TEXT,
        ADD COLUMN IF NOT EXISTS "suppressedDownAt" TIMESTAMP(3),
        ADD COLUMN IF NOT EXISTS "suppressedDownMessage" TEXT
    `);

    const monitorResult = await client.query(
      `SELECT "id", "url" FROM "Monitor" ORDER BY "id"`
    );
    const normalizedByUrl = new Map();

    for (const monitor of monitorResult.rows) {
      const normalizedUrl = normalizeUrl(monitor.url);
      const existingId = normalizedByUrl.get(normalizedUrl);
      if (existingId && existingId !== monitor.id) {
        throw new Error(
          `Duplicate normalized monitor URL "${normalizedUrl}" found for ${existingId} and ${monitor.id}`
        );
      }
      normalizedByUrl.set(normalizedUrl, monitor.id);
      await client.query(
        `UPDATE "Monitor" SET "normalizedUrl" = $1 WHERE "id" = $2`,
        [normalizedUrl, monitor.id]
      );
    }

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "Monitor_normalizedUrl_key"
      ON "Monitor"("normalizedUrl")
    `);
    await client.query(`
      ALTER TABLE "Monitor"
      ALTER COLUMN "normalizedUrl" SET NOT NULL
    `);

    const alertEventTableResult = await client.query(
      `SELECT to_regclass('"AlertEvent"') AS table_name`
    );
    if (alertEventTableResult.rows[0]?.table_name) {
      await client.query(`
        ALTER TABLE "AlertEvent"
        ADD COLUMN IF NOT EXISTS "processingAt" TIMESTAMP(3)
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS "AlertEvent_status_processingAt_idx"
        ON "AlertEvent"("status", "processingAt")
      `);
    }

    await client.query("COMMIT");
    console.log(
      `[database] Schema ready; normalized ${monitorResult.rowCount ?? monitorResult.rows.length} monitor URL(s)`
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

main()
  .catch((error) => {
    console.error(`Database preparation failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
