import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/server/auth";
import { db } from "@/server/db";

export async function requireActiveUser() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/login");
  }

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      isActive: true,
      roles: {
        select: {
          role: {
            select: {
              code: true,
            },
          },
        },
      },
    },
  });

  if (!user || !user.isActive) {
    redirect("/login");
  }

  return {
    id: user.id,
    name: user.name,
    isActive: user.isActive,
    roles: user.roles.map(({ role }) => role.code),
  };
}