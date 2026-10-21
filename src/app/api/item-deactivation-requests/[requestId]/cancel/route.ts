import { z } from "zod";

import { authorizeApi } from "@/server/authorize-api";
import {
  cancelItemDeactivation,
  ItemDeactivationError,
} from "@/server/item-deactivation";
import { PayloadTooLargeError, readJsonBody } from "@/server/read-json-body";
import { validateMutationRequest } from "@/server/validate-mutation-request";

const requestIdSchema = z.string().uuid();
const cancelBodySchema = z.object({}).strict();

const responseHeaders = {
  "Cache-Control": "no-store",
};

export async function POST(
  request: Request,
  context: { params: Promise<{ requestId: string }> },
) {
  const authorization = await authorizeApi(
    "inventory:item:deactivation:cancel",
  );

  if (!authorization.authorized) {
    return authorization.response;
  }

  const rejectedRequest = validateMutationRequest(request);

  if (rejectedRequest) {
    return rejectedRequest;
  }

  const { requestId } = await context.params;
  const parsedId = requestIdSchema.safeParse(requestId);

  if (!parsedId.success) {
    return Response.json(
      {
        error: "INVALID_INPUT",
        message: "ID pengajuan tidak valid.",
      },
      {
        status: 400,
        headers: responseHeaders,
      },
    );
  }

  let body: unknown;

  try {
    body = await readJsonBody(request);
  } catch (error) {
    const tooLarge = error instanceof PayloadTooLargeError;

    return Response.json(
      {
        error: tooLarge ? "PAYLOAD_TOO_LARGE" : "INVALID_INPUT",
        message: tooLarge
          ? "Ukuran data maksimal 256 KiB."
          : "Format JSON tidak valid.",
      },
      {
        status: tooLarge ? 413 : 400,
        headers: responseHeaders,
      },
    );
  }

  if (!cancelBodySchema.safeParse(body).success) {
    return Response.json(
      {
        error: "INVALID_INPUT",
        message: "Pembatalan hanya menerima objek JSON kosong.",
      },
      {
        status: 400,
        headers: responseHeaders,
      },
    );
  }

  try {
    const deactivationRequest = await cancelItemDeactivation(
      parsedId.data,
      authorization.user.id,
    );

    return Response.json({ deactivationRequest }, { headers: responseHeaders });
  } catch (error) {
    if (error instanceof ItemDeactivationError) {
      const statusByCode = {
        ITEM_NOT_FOUND: 404,
        ITEM_INACTIVE: 409,
        PENDING_REQUEST_EXISTS: 409,
        REQUEST_NOT_FOUND: 404,
        REQUEST_NOT_PENDING: 409,
        REQUEST_NOT_OWNER: 403,
      } as const;

      return Response.json(
        {
          error: error.code,
          message: error.message,
        },
        {
          status: statusByCode[error.code],
          headers: responseHeaders,
        },
      );
    }

    throw error;
  }
}
