import { ZodError } from "zod";

import { authorizeApi } from "@/server/authorize-api";
import { db } from "@/server/db";
import { guestVisitIdSchema } from "@/server/guest-visit-input";
import { guestVisitSelect } from "@/server/guest-visits";
import { PayloadTooLargeError, readJsonBody } from "@/server/read-json-body";
import { GuestVisitUpdateError, updateGuestVisit } from "@/server/update-guest-visit";
import { validateMutationRequest } from "@/server/validate-mutation-request";

const headers = { "Cache-Control": "no-store" };

export async function GET(_request: Request, context: { params: Promise<{ visitId: string }> }) {
  const authorization = await authorizeApi("guests:view");
  if (!authorization.authorized) return authorization.response;
  const parsed = guestVisitIdSchema.safeParse((await context.params).visitId);
  if (!parsed.success) return Response.json({ error: "INVALID_INPUT", message: "ID kunjungan tidak valid." }, { status: 400, headers });
  const visit = await db.guestVisit.findUnique({ where: { id: parsed.data }, select: guestVisitSelect });
  if (!visit) return Response.json({ error: "NOT_FOUND", message: "Kunjungan tidak ditemukan." }, { status: 404, headers });
  return Response.json({ visit }, { headers });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ visitId: string }> },
) {
  const authorization = await authorizeApi("guests:update");
  if (!authorization.authorized) return authorization.response;
  const rejected = validateMutationRequest(request);
  if (rejected) return rejected;

  let body: unknown;
  try {
    body = await readJsonBody(request);
  } catch (error) {
    const tooLarge = error instanceof PayloadTooLargeError;
    if (!tooLarge && !(error instanceof SyntaxError)) throw error;
    return Response.json(
      {
        error: tooLarge ? "PAYLOAD_TOO_LARGE" : "INVALID_INPUT",
        message: tooLarge
          ? "Ukuran data maksimal 256 KiB."
          : "Format JSON tidak valid.",
      },
      { status: tooLarge ? 413 : 400, headers },
    );
  }

  const { visitId } = await context.params;
  try {
    const result = await updateGuestVisit(
      visitId,
      body,
      authorization.user.id,
    );
    return Response.json(result, { headers });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json(
        {
          error: "INVALID_INPUT",
          message: "Periksa ID kunjungan, nama tamu, kamar, dan alasan koreksi.",
          issues: error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
        { status: 400, headers },
      );
    }
    if (error instanceof GuestVisitUpdateError) {
      return Response.json(
        {
          error: error.code,
          message: error.message,
          matchingVisitId: error.matchingVisitId,
        },
        { status: error.code === "VISIT_NOT_FOUND" ? 404 : 409, headers },
      );
    }
    throw error;
  }
}
