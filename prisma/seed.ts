import { loadEnvConfig } from "@next/env";
import { seedReferenceData } from "./seed-reference";

async function main() {
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");
  const { db } = await import("../src/server/db");
  try {
    await db.$transaction(seedReferenceData);
    console.log("Reference seed completed: four role codes and HK Main Storage ensured.");
  } finally {
    await db.$disconnect();
  }
}

main().catch(() => {
  console.error("Reference seed failed. Check database configuration and migration status.");
  process.exitCode = 1;
});
