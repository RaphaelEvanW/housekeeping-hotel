import { ZodError } from "zod";

import { authorizeApi } from "@/server/authorize-api";
import { listGuestBorrowings } from "@/server/list-guest-borrowings";

const headers = { "Cache-Control": "no-store" };

export async function GET(
  request: Request,
  context: { params: Promise<{ visitId: string }> },
) {
  const authorization = await authorizeApi("borrowing:view");
  if (!authorization.authorized) return authorization.response;

  const { visitId } = await context.params;
  const query = new URL(request.url).searchParams;

  try {
    const result = await listGuestBorrowings({
      visitId,
      status: query.get("status") ?? undefined,
      page: query.get("page") ?? undefined,
      pageSize: query.get("pageSize") ?? undefined,
    });

    if (!result) {
      return Response.json(
        { error: "NOT_FOUND", message: "Kunjungan tidak ditemukan." },
        { status: 404, headers },
      );
    }

    return Response.json(result, { headers });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json(
        {
          error: "INVALID_INPUT",
          message: "ID kunjungan atau parameter daftar peminjaman tidak valid.",
        },
        { status: 400, headers },
      );
    }

    throw error;
  }
}
