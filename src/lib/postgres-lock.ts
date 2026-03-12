import { pool } from "@/lib/prisma";

interface WithAdvisoryLockResult<T> {
  acquired: boolean;
  result?: T;
}

export async function withAdvisoryLock<T>(
  lockKey: number,
  work: () => Promise<T>
): Promise<WithAdvisoryLockResult<T>> {
  const client = await pool.connect();
  let acquired = false;

  try {
    const lockResult = await client.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock($1) AS locked",
      [lockKey]
    );
    acquired = lockResult.rows[0]?.locked ?? false;

    if (!acquired) {
      return { acquired: false };
    }

    const result = await work();
    return { acquired: true, result };
  } finally {
    if (acquired) {
      await client.query("SELECT pg_advisory_unlock($1)", [lockKey]).catch(() => {});
    }
    client.release();
  }
}
