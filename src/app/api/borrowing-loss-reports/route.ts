import { ZodError } from "zod";

import { authorizeApi } from "@/server/authorize-api";
import { createBorrowingLossPost } from "@/server/borrowing-loss-post";
import { reportBorrowingLoss } from "@/server/borrowing-loss";
import { listBorrowingLossReports } from "@/server/list-borrowing-loss-reports";

export const POST = createBorrowingLossPost(
  "loss:report",
  reportBorrowingLoss,
  201,
);

export async function GET(request: Request) {
  const authorization = await authorizeApi("loss:view");
  if (!authorization.authorized) return authorization.response;

  const query = new URL(request.url).searchParams;
  const headers = { "Cache-Control": "no-store" };

  try {
    const result = await listBorrowingLossReports({
      page: query.get("page") ?? undefined,
      pageSize: query.get("pageSize") ?? undefined,
      q: query.get("q") ?? undefined,
      status: query.get("status") ?? undefined,
    });

    return Response.json(result, { headers });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json(
        {
          error: "INVALID_INPUT",
          message: "Parameter daftar laporan kehilangan tidak valid.",
        },
        { status: 400, headers },
      );
    }

    throw error;
  }
}
