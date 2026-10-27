import { loadEnvConfig } from "@next/env";
import { hashPassword } from "better-auth/crypto";
import { z } from "zod";
import type { RoleCode } from "../src/generated/prisma/enums";

type DevAccount = { name: string; email: string; roleCode?: RoleCode };

const testingAccounts = [
  { name: "Testing HK Staff", email: "staff@housekeeping.test", roleCode: "HK_STAFF" },
  { name: "Testing HK Supervisor", email: "supervisor@housekeeping.test", roleCode: "HK_SUPERVISOR" },
  { name: "Testing Management", email: "management@housekeeping.test", roleCode: "MANAGEMENT" },
  { name: "Testing System Admin", email: "admin@housekeeping.test", roleCode: "SYSTEM_ADMIN" },
] as const satisfies readonly DevAccount[];

async function main() {
  loadEnvConfig(process.cwd(), true);

  if (process.env.NODE_ENV === "production" || process.env.NODE_ENV === "test") {
    throw new Error("Script ini hanya untuk development.");
  }

  const allRoles = process.argv.includes("--all-roles");

  const input = z.object({
    password: z.string().min(12).max(128),
    DATABASE_URL: z.url(),
  }).safeParse({
    DATABASE_URL: process.env.DATABASE_URL,
    password: allRoles ? process.env.DEV_TEST_USERS_PASSWORD : process.env.DEV_USER_PASSWORD,
  });

  if (!input.success) {
    console.error("Periksa konfigurasi:", [
      ...new Set(input.error.issues.map((issue) => issue.path[0] === "password"
        ? allRoles ? "DEV_TEST_USERS_PASSWORD" : "DEV_USER_PASSWORD"
        : issue.path.join("."))),
    ].join(", "));
    process.exitCode = 1;
    return;
  }

  let accounts: readonly DevAccount[] = testingAccounts;
  if (!allRoles) {
    const single = z.object({
      DEV_USER_NAME: z.string().trim().min(1),
      DEV_USER_EMAIL: z.email().trim().toLowerCase(),
    }).safeParse(process.env);
    if (!single.success) {
      console.error("Isi DEV_USER_NAME dan DEV_USER_EMAIL untuk membuat satu akun.");
      process.exitCode = 1;
      return;
    }
    accounts = [{ name: single.data.DEV_USER_NAME, email: single.data.DEV_USER_EMAIL }];
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
    const roles = allRoles ? await db.role.findMany({ select: { id: true, code: true } }) : [];
    const roleIds = new Map(roles.map((role) => [role.code, role.id]));
    if (allRoles && testingAccounts.some((account) => !roleIds.has(account.roleCode))) {
      console.error("Role referensi belum lengkap. Jalankan npm.cmd run db:seed terlebih dahulu.");
      process.exitCode = 1;
      return;
    }

    const prepared = await Promise.all(accounts.map(async (account) => ({
      ...account,
      passwordHash: await hashPassword(input.data.password),
    })));

    const results = await db.$transaction(async (tx) => {
      const results: string[] = [];
      for (const account of prepared) {
        const existing = await tx.user.findUnique({ where: { email: account.email }, select: { id: true } });
        if (existing) {
          results.push(`${account.email}: sudah ada; password dan role tidak diubah.`);
          continue;
        }

        const user = await tx.user.create({ data: { name: account.name, email: account.email } });
        await tx.account.create({
          data: {
            userId: user.id,
            accountId: user.id,
            providerId: "credential",
            password: account.passwordHash,
          },
        });
        if (account.roleCode) {
          const roleId = roleIds.get(account.roleCode);
          if (!roleId) throw new Error("Role referensi tidak ditemukan.");
          await tx.userRole.create({ data: { userId: user.id, roleId } });
        }
        results.push(`${account.email}: dibuat${account.roleCode ? ` (${account.roleCode})` : ""}.`);
      }
      return results;
    }, { timeout: 15_000 });

    results.forEach((message) => console.log(message));
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
