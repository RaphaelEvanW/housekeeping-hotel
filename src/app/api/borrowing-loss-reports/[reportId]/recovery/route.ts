import { ZodError } from "zod";

import { authorizeApi } from "@/server/authorize-api";
import { BorrowingLossError } from "@/server/borrowing-loss";
import { recoverBorrowedUnitInputSchema } from "@/server/borrowing-loss-input";
import { createUnitConditionPost } from "@/server/unit-condition-post";
import {
  getBorrowingRecovery,
  recoverBorrowedUnit,
} from "@/server/recover-borrowed-unit";

const headers = { "Cache-Control": "no-store" };
type Context = { params: Promise<{ reportId: string }> };

export function POST(request: Request, context: Context) {
  return createUnitConditionPost({
    permission: "loss:recover",
    parseInput: (input) => recoverBorrowedUnitInputSchema.parse(input),
    save: async (input, actorId, photos) => {
      const { reportId } = await context.params;
      return recoverBorrowedUnit(reportId, input, actorId, photos);
    },
    invalidInputMessage:
      "Periksa waktu penerimaan, lokasi Housekeeping, kondisi, catatan, dan foto.",
    mapError: (error) => {
      if (error instanceof ZodError) {
        return {
          error: "INVALID_INPUT",
          message: "ID laporan kehilangan tidak valid.",
          status: 400,
        };
      }
      if (!(error instanceof BorrowingLossError)) return null;

      const status =
        error.code === "PHOTOS_REQUIRED" || error.code === "INVALID_TIME"
          ? 400
          : error.code === "REPORT_NOT_FOUND" || error.code === "LINE_NOT_FOUND"
            ? 404
            : 409;
      return { error: error.code, message: error.message, status };
    },
  })(request);
}

export async function GET(_request: Request, context: Context) {
  const authorization = await authorizeApi("loss:view");
  if (!authorization.authorized) return authorization.response;

  try {
    const { reportId } = await context.params;
    const result = await getBorrowingRecovery(reportId);
    if (!result) {
      return Response.json(
        {
          error: "REPORT_NOT_FOUND",
          message: "Laporan kehilangan tidak ditemukan.",
        },
        { status: 404, headers },
      );
    }
    return Response.json(result, { headers });
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
