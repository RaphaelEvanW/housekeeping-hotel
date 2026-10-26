import { ZodError } from "zod";
import { authorizeApi } from "@/server/authorize-api";
import {
  registerGuestVisit,
  GuestVisitRegistrationError,
} from "@/server/guest-visits";
import { readJsonBody, PayloadTooLargeError } from "@/server/read-json-body";
import { validateMutationRequest } from "@/server/validate-mutation-request";
import { listGuestVisits } from "@/server/list-guest-visits";

const headers = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const authorization = await authorizeApi("guests:view");
  if (!authorization.authorized) return authorization.response;
  const query = new URL(request.url).searchParams;

  try {
    const result = await listGuestVisits({
      page: query.get("page") ?? undefined,
      pageSize: query.get("pageSize") ?? undefined,
      q: query.get("q") ?? undefined,
      status: query.get("status") ?? undefined,
    });
    return Response.json(result, { headers });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({
        error: "INVALID_INPUT",
        message: "Parameter daftar kunjungan tidak valid.",
      }, { status: 400, headers });
    }
    throw error;
  }
}

export async function POST(request: Request) {
  const authorization = await authorizeApi("guests:create");
  if (!authorization.authorized) return authorization.response;
  const rejected = validateMutationRequest(request);
  if (rejected) return rejected;
  let input: unknown;
  try {
    input = await readJsonBody(request);
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      return Response.json(
        {
          error: "PAYLOAD_TOO_LARGE",
          message: "Ukuran data maksimal 256 KiB.",
        },
        { status: 413, headers },
      );
    }
    if (!(error instanceof SyntaxError)) throw error;
    return Response.json(
      { error: "INVALID_INPUT", message: "Format JSON tidak valid." },
      { status: 400, headers },
    );
  }
  try {
    const result = await registerGuestVisit(input, authorization.user.id);
    return Response.json(result, {
      status: result.replayed ? 200 : 201,
      headers,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json(
        {
          error: "INVALID_INPUT",
          message: "Periksa data kunjungan tamu.",
          issues: error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
        { status: 400, headers },
      );
    }
    if (error instanceof GuestVisitRegistrationError) {
      return Response.json(
        {
          error: error.code,
          message: error.message,
          matchingVisitId: error.matchingVisitId,
        },
        { status: 409, headers },
      );
    }
    throw error;
  }
}
