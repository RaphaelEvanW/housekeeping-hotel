import { loadEnvConfig } from "@next/env";
import { hashPassword } from "better-auth/crypto";
import { z } from "zod";

async function main() {
  if (process.env.NODE_ENV === "production" || process.env.NODE_ENV === "test") {
    throw new Error("Script ini hanya untuk development.");
  }

  loadEnvConfig(process.cwd(), true);

  const input = z.object({
    DEV_USER_NAME: z.string().trim().min(1),
    DEV_USER_EMAIL: z.email().trim().toLowerCase(),
    DEV_USER_PASSWORD: z.string().min(12).max(128),
    DATABASE_URL: z.url(),
  }).safeParse(process.env);

  if (!input.success) {
    console.error("Periksa konfigurasi:", [
      ...new Set(input.error.issues.map((issue) => issue.path.join("."))),
    ].join(", "));
    process.exitCode = 1;
    return;
  }

  const target = new URL(input.data.DATABASE_URL);

  if (
    !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) ||
    target.pathname !== "/housekeeping_dev" ||
    target.username !== "housekeeping_dev"
  ) {
    throw new Error("Script hanya boleh memakai database development lokal.");
  }

  const { db } = await import("../src/server/db");

  try {
    const email = input.data.DEV_USER_EMAIL;
    const existingUser = await db.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      console.log("Email sudah terdaftar. Akun tidak diubah.");
      return;
    }

    const passwordHash = await hashPassword(input.data.DEV_USER_PASSWORD);

    await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: input.data.DEV_USER_NAME,
          email,
        },
      });

      await tx.account.create({
        data: {
          userId: user.id,
          accountId: user.id,
          providerId: "credential",
          password: passwordHash,
        },
      });
    });

    console.log("Akun development berhasil dibuat.");
  } finally {
    await db.$disconnect();
  }
}

main().catch(() => {
  console.error(
    "Pembuatan akun gagal. Periksa target database, koneksi, dan migrasi.",
  );
  process.exitCode = 1;
});