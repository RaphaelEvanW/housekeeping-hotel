import { ZodError } from "zod";
import { authorizeApi } from "@/server/authorize-api";
import { getBorrowingLossReport } from "@/server/borrowing-loss";

const headers = { "Cache-Control": "no-store" };

export async function GET(
  _request: Request,
  context: { params: Promise<{ reportId: string }> },
) {
  const authorization = await authorizeApi("loss:view");
  if (!authorization.authorized) return authorization.response;

  try {
    const { reportId } = await context.params;
    const report = await getBorrowingLossReport(reportId);
    if (!report) {
      return Response.json(
        {
          error: "REPORT_NOT_FOUND",
          message: "Laporan kehilangan tidak ditemukan.",
        },
        { status: 404, headers },
      );
    }
    return Response.json({ report }, { headers });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json(
        {
          error: "INVALID_INPUT",
          message: "ID laporan kehilangan tidak valid.",
        },
        { status: 400, headers },
      );
    }
    throw error;
  }
}
