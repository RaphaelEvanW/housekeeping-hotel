import { ZodError } from "zod";
import { BorrowingLossError } from "@/server/borrowing-loss";
import { proposeReplacement } from "@/server/borrowing-loss-replacement";
import { proposeReplacementInputSchema } from "@/server/borrowing-loss-settlement-input";
import { createUnitConditionPost } from "@/server/unit-condition-post";

export function POST(request: Request, context: { params: Promise<{ reportId: string }> }) {
  return createUnitConditionPost({
    permission: "loss:settle:propose",
    parseInput: (input) => proposeReplacementInputSchema.parse(input),
    save: async (input, actorId, photos) => {
      const { reportId } = await context.params;
      return proposeReplacement(reportId, input, actorId, photos);
    },
    invalidInputMessage: "Periksa jenis barang pengganti, kondisi, waktu penerimaan, konfirmasi, catatan, dan foto.",
    mapError: (error) => {
      if (error instanceof ZodError) return { error: "INVALID_INPUT", message: "ID laporan kehilangan tidak valid.", status: 400 };
      if (!(error instanceof BorrowingLossError)) return null;
      const status = error.code === "PHOTOS_REQUIRED" || error.code === "INVALID_TIME" ? 400
        : error.code === "REPORT_NOT_FOUND" || error.code === "LINE_NOT_FOUND" ? 404 : 409;
      return { error: error.code, message: error.message, status };
    },
  })(request);
}
