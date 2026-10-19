import { redirect } from "next/navigation";

import { getNavigationItems } from "@/lib/navigation";
import { requireActiveUser } from "@/server/require-active-user";

export default async function StartPage() {
  const user = await requireActiveUser();

  const firstAvailablePage = getNavigationItems(user.roles).find(
    (item) => item.available,
  );

  redirect(firstAvailablePage?.href ?? "/access-denied");
}