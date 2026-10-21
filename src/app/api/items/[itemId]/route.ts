import { z } from "zod";

import { authorizeApi } from "@/server/authorize-api";
import { updateItemInputSchema } from "@/server/item-input";
import {
  DuplicateItemNameError,
  ItemNotFoundError,
  updateItemName,
} from "@/server/items";
import {
  PayloadTooLargeError,
  readJsonBody,
} from "@/server/read-json-body";
import { validateMutationRequest } from "@/server/validate-mutation-request";

const itemIdSchema = z.string().uuid();

const responseHeaders = {
  "Cache-Control": "no-store",
};

export async function PATCH(
  request: Request,
  context: { params: Promise<{ itemId: string }> },
) {
  const authorization = await authorizeApi("inventory:item:update");

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

  const parsed = updateItemInputSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json(
      {
        error: "INVALID_INPUT",
        message: "Data perubahan nama jenis barang tidak valid.",
      },
      {
        status: 400,
        headers: responseHeaders,
      },
    );
  }

  try {
    const item = await updateItemName(
      parsedId.data,
      parsed.data.name,
      authorization.user.id,
    );

    return Response.json(
      { item },
      { headers: responseHeaders },
    );
  } catch (error) {
    if (error instanceof ItemNotFoundError) {
      return Response.json(
        {
          error: "ITEM_NOT_FOUND",
          message: error.message,
        },
        {
          status: 404,
          headers: responseHeaders,
        },
      );
    }

    if (error instanceof DuplicateItemNameError) {
      return Response.json(
        {
          error: "ITEM_NAME_EXISTS",
          message: error.message,
        },
        {
          status: 409,
          headers: responseHeaders,
        },
      );
    }

    throw error;
  }
}