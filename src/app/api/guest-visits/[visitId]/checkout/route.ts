import { ZodError } from "zod";

import { authorizeApi } from "@/server/authorize-api";
import { checkoutGuestVisit, GuestVisitCheckoutError } from "@/server/checkout-guest-visit";
import { PayloadTooLargeError, readJsonBody } from "@/server/read-json-body";
import { validateMutationRequest } from "@/server/validate-mutation-request";

const headers = { "Cache-Control": "no-store" };

export async function POST(
  request: Request,
  context: { params: Promise<{ visitId: string }> },
) {
  const authorization = await authorizeApi("guests:checkout");
  if (!authorization.authorized) return authorization.response;
  const rejected = validateMutationRequest(request);
  if (rejected) return rejected;

  let body: unknown;
  try {
    body = await readJsonBody(request);
  } catch (error) {
    const tooLarge = error instanceof PayloadTooLargeError;
    if (!tooLarge && !(error instanceof SyntaxError)) throw error;
    return Response.json({
      error: tooLarge ? "PAYLOAD_TOO_LARGE" : "INVALID_INPUT",
      message: tooLarge ? "Ukuran data maksimal 256 KiB." : "Format JSON tidak valid.",
    }, { status: tooLarge ? 413 : 400, headers });
  }

  const { visitId } = await context.params;
  try {
    const result = await checkoutGuestVisit(visitId, body, authorization.user.id);
    return Response.json(result, { headers });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({
        error: "INVALID_INPUT",
        message: "Periksa ID kunjungan dan konfirmasi checkout.",
        issues: error.issues.map((issue) => ({
          path: issue.path.join("."), message: issue.message,
        })),
      }, { status: 400, headers });
    }
    if (error instanceof GuestVisitCheckoutError) {
      return Response.json({
        error: error.code,
        message: error.message,
        outstandingLines: error.outstandingLines,
      }, { status: error.code === "VISIT_NOT_FOUND" ? 404 : 409, headers });
    }
    throw error;
  }
}
