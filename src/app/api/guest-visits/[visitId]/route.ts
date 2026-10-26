import { authorizeApi } from "@/server/authorize-api";
import { db } from "@/server/db";
import { guestVisitIdSchema } from "@/server/guest-visit-input";
import { guestVisitSelect } from "@/server/guest-visits";

export async function GET(_request: Request, context: { params: Promise<{ visitId: string }> }) {
  const authorization = await authorizeApi("guests:view");
  if (!authorization.authorized) return authorization.response;
  const headers = { "Cache-Control": "no-store" };
  const parsed = guestVisitIdSchema.safeParse((await context.params).visitId);
  if (!parsed.success) return Response.json({ error: "INVALID_INPUT", message: "ID kunjungan tidak valid." }, { status: 400, headers });
  const visit = await db.guestVisit.findUnique({ where: { id: parsed.data }, select: guestVisitSelect });
  if (!visit) return Response.json({ error: "NOT_FOUND", message: "Kunjungan tidak ditemukan." }, { status: 404, headers });
  return Response.json({ visit }, { headers });
}
