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
    await client.query("BEGIN");

    const tableResult = await client.query(`SELECT to_regclass('"Monitor"') AS table_name`);
    if (!tableResult.rows[0]?.table_name) {
      await client.query("COMMIT");
      return;
    }

    await client.query(`
      ALTER TABLE "Monitor"
      ADD COLUMN IF NOT EXISTS "normalizedUrl" TEXT
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
    await client.query("COMMIT");
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
  .finally(() => pool.end());
