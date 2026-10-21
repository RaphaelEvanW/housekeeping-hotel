import { z, ZodError } from "zod";

import { authorizeApi } from "@/server/authorize-api";
import {
  ItemDeactivationError,
  requestItemDeactivation,
} from "@/server/item-deactivation";
import { PayloadTooLargeError, readJsonBody } from "@/server/read-json-body";
import { validateMutationRequest } from "@/server/validate-mutation-request";

const itemIdSchema = z.string().uuid();

const responseHeaders = {
  "Cache-Control": "no-store",
};

export async function POST(
  request: Request,
  context: { params: Promise<{ itemId: string }> },
) {
  const authorization = await authorizeApi(
    "inventory:item:deactivation:request",
  );

  if (!authorization.authorized) {
    return authorization.response;
  }

  const rejectedRequest = validateMutationRequest(request);

  if (rejectedRequest) {
    return rejectedRequest;
  }

  const { itemId } = await context.params;
  const parsedId = itemIdSchema.safeParse(itemId);

  if (!parsedId.success) {
    return Response.json(
      {
        error: "INVALID_INPUT",
        message: "ID jenis barang tidak valid.",
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

  try {
    const deactivationRequest = await requestItemDeactivation(
      parsedId.data,
      body,
      authorization.user.id,
    );

    return Response.json(
      { deactivationRequest },
      {
        status: 201,
        headers: responseHeaders,
      },
    );
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json(
        {
          error: "INVALID_INPUT",
          message: "Alasan pengajuan tidak valid atau ada field tambahan.",
        },
        {
          status: 400,
          headers: responseHeaders,
        },
      );
    }

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
