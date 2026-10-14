import { loadEnvConfig } from "@next/env";
import { defineConfig } from "prisma/config";
import { readDatabaseEnv } from "./src/server/env";

loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "node --conditions=react-server --import tsx prisma/seed.ts",
  },
  datasource: { url: readDatabaseEnv(process.env).databaseUrl },
});
