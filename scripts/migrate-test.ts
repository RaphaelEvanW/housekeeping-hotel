import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { loadEnvConfig } from "@next/env";
import { readDatabaseEnv } from "../src/server/env";

Object.assign(process.env, { NODE_ENV: "test" });
loadEnvConfig(process.cwd());
readDatabaseEnv(process.env);

const result = spawnSync(
  process.execPath,
  [resolve("node_modules/prisma/build/index.js"), "migrate", "deploy"],
  { stdio: "inherit", env: process.env },
);

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
