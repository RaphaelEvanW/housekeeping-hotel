import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { readDatabaseEnv } from "./env";

const { databaseUrl } = readDatabaseEnv(process.env);
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaPg({
      connectionString: databaseUrl,
      max: 5,
      connectionTimeoutMillis: 5000,
    }),
  });

if (process.env.NODE_ENV === "development") globalForPrisma.prisma = db;
