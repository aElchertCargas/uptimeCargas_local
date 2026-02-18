import "dotenv/config";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const sampleMonitors = [
  { name: "Google", url: "https://www.google.com", interval: 120 },
  { name: "GitHub", url: "https://github.com", interval: 120 },
  { name: "Cloudflare", url: "https://www.cloudflare.com", interval: 120 },
  { name: "httpbin 200", url: "https://httpbin.org/status/200", interval: 60 },
  { name: "httpbin 404 (will fail)", url: "https://httpbin.org/status/404", interval: 60 },
];

async function main() {
  console.log("Seeding database...");

  for (const monitor of sampleMonitors) {
    const existing = await prisma.monitor.findFirst({
      where: { url: monitor.url },
    });
    if (!existing) {
      await prisma.monitor.create({ data: monitor });
      console.log(`  Created: ${monitor.name}`);
    } else {
      console.log(`  Skipped (exists): ${monitor.name}`);
    }
  }

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
