import "server-only";

import { SerializedPrismaPg } from "./serialized-prisma-pg";
import { PrismaClient } from "../generated/prisma/client";
import { readDatabaseEnv } from "./env";

const { databaseUrl } = readDatabaseEnv(process.env);
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new SerializedPrismaPg({
      connectionString: databaseUrl,
      max: 5,
      connectionTimeoutMillis: 5000,
    }),
  });

if (process.env.NODE_ENV === "development") globalForPrisma.prisma = db;
