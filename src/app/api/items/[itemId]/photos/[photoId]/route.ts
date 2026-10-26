import { z } from "zod";
import { authorizeApi } from "@/server/authorize-api";
import { db } from "@/server/db";
import { itemPhotoResponse } from "@/server/item-photo";

const paramsSchema = z.object({ itemId: z.uuid(), photoId: z.uuid() });

export async function GET(_request: Request, { params }: {
  params: Promise<{ itemId: string; photoId: string }>;
}) {
  const authorization = await authorizeApi("inventory:view");
  if (!authorization.authorized) return authorization.response;
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) return itemPhotoResponse(null);
  const photo = await db.itemPhoto.findFirst({
    where: { id: parsed.data.photoId, itemId: parsed.data.itemId },
    select: { photoKey: true },
  });
  return itemPhotoResponse(photo?.photoKey);
}
