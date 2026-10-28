import { z } from "zod";
import { authorizeApi } from "@/server/authorize-api";
import { db } from "@/server/db";
import { readUnitPhoto } from "@/server/unit-photo";

const paramsSchema = z.object({
  reportId: z.string().uuid(),
  settlementId: z.string().uuid(),
  photoId: z.string().uuid(),
});
const privateHeaders = { "Cache-Control": "private, no-store" };

export async function GET(
  _request: Request,
  context: { params: Promise<{ reportId: string; settlementId: string; photoId: string }> },
) {
  const authorization = await authorizeApi("loss:view");
  if (!authorization.authorized) return authorization.response;
  const parsed = paramsSchema.safeParse(await context.params);
  if (!parsed.success) return new Response(null, { status: 404, headers: privateHeaders });
  const { reportId, settlementId, photoId } = parsed.data;
  const photo = await db.borrowingLossSettlementPhoto.findFirst({
    where: { id: photoId, settlementId, settlement: { lossReportId: reportId, method: "REPLACEMENT" } },
    select: { photoKey: true },
  });
  if (!photo) return new Response(null, { status: 404, headers: privateHeaders });
  try {
    const bytes = await readUnitPhoto(photo.photoKey);
    return new Response(new Uint8Array(bytes), { headers: {
      ...privateHeaders,
      "Content-Type": "image/webp",
      "Content-Length": String(bytes.byteLength),
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    } });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return new Response(null, { status: 404, headers: privateHeaders });
    }
    throw error;
  }
}
