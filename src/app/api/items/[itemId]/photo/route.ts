import { z } from "zod";
import { authorizeApi } from "@/server/authorize-api";
import { db } from "@/server/db";
import { itemPhotoResponse } from "@/server/item-photo";

export async function GET(_request: Request, { params }: { params: Promise<{ itemId: string }> }) {
  const authorization = await authorizeApi("inventory:view");
  if (!authorization.authorized) return authorization.response;
  const { itemId } = await params;
  if (!z.string().uuid().safeParse(itemId).success) return itemPhotoResponse(null);
  const item = await db.item.findUnique({ where: { id: itemId }, select: { photoKey: true } });
  return itemPhotoResponse(item?.photoKey);
}
