import { z } from "zod";
import { authorizeApi } from "@/server/authorize-api";
import { db } from "@/server/db";
import { readItemPhoto } from "@/server/item-photo";

export async function GET(_request: Request, { params }: { params: Promise<{ itemId: string }> }) {
  const authorization = await authorizeApi("inventory:view");
  if (!authorization.authorized) return authorization.response;
  const { itemId } = await params;
  if (!z.string().uuid().safeParse(itemId).success) return new Response(null, { status: 404 });
  const item = await db.item.findUnique({ where: { id: itemId }, select: { photoKey: true } });
  if (!item?.photoKey) return new Response(null, { status: 404 });
  try {
    const bytes = await readItemPhoto(item.photoKey);
    return new Response(new Uint8Array(bytes), { headers: {
      "Content-Type": "image/webp",
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    } });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return new Response(null, { status: 404 });
    throw error;
  }
}
