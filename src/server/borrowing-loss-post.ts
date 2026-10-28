import "server-only";

import { ZodError } from "zod";
import type { Permission } from "@/lib/permissions";
import { authorizeApi } from "@/server/authorize-api";
import { BorrowingLossError } from "@/server/borrowing-loss";
import { PayloadTooLargeError, readJsonBody } from "@/server/read-json-body";
import { validateMutationRequest } from "@/server/validate-mutation-request";

const headers = { "Cache-Control": "no-store" };

export function createBorrowingLossPost(
  permission: Permission,
  save: (body: unknown, actorId: string) => Promise<{ replayed: boolean }>,
  successStatus: 200 | 201,
) {
  return async function POST(request: Request) {
    const authorization = await authorizeApi(permission);
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
            : "Periksa kembali data laporan kehilangan.",
        },
        { status: tooLarge ? 413 : 400, headers },
      );
    }

    try {
      const result = await save(body, authorization.user.id);
      return Response.json(result, {
        status: result.replayed ? 200 : successStatus,
        headers,
      });
    } catch (error) {
      if (error instanceof ZodError) {
        return Response.json(
          {
            error: "INVALID_INPUT",
            message: "Periksa kembali data laporan kehilangan.",
            issues: error.issues.map((issue) => ({
              path: issue.path.join("."),
              message: issue.message,
            })),
          },
          { status: 400, headers },
        );
      }
      if (error instanceof BorrowingLossError) {
        const status =
          error.code === "LINE_NOT_FOUND" ||
          error.code === "REPORT_NOT_FOUND" ||
          error.code === "SETTLEMENT_NOT_FOUND"
            ? 404
            : 409;
        return Response.json(
          { error: error.code, message: error.message },
          { status, headers },
        );
      }
      throw error;
    }
  };
}
