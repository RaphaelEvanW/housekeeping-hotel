import "server-only";

import { redirect } from "next/navigation";

import { getActiveUser } from "@/server/get-active-user";

export async function requireActiveUser() {
  const user = await getActiveUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}