import { z, ZodError } from "zod";

import { authorizeApi } from "@/server/authorize-api";
import {
  ItemUnitNotFoundError,
  updateItemUnitDetails,
} from "@/server/item-units";
import {
  PayloadTooLargeError,
  readJsonBody,
} from "@/server/read-json-body";
import { validateMutationRequest } from "@/server/validate-mutation-request";

const unitIdSchema = z.string().uuid();

const responseHeaders = {
  "Cache-Control": "no-store",
};

export async function PATCH(
  request: Request,
  context: { params: Promise<{ unitId: string }> },
) {
  const authorization = await authorizeApi("inventory:unit:update");

  if (!authorization.authorized) {
    return authorization.response;
  }

  const rejectedRequest = validateMutationRequest(request);

  if (rejectedRequest) {
    return rejectedRequest;
  }

  const { unitId } = await context.params;
  const parsedId = unitIdSchema.safeParse(unitId);

  if (!parsedId.success) {
    return Response.json(
      {
        error: "INVALID_INPUT",
        message: "ID unit barang tidak valid.",
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

    if (!tooLarge && !(error instanceof SyntaxError)) {
      throw error;
    }

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
    const unit = await updateItemUnitDetails(
      parsedId.data,
      body,
      authorization.user.id,
    );

    return Response.json(
      {
        unit: {
          id: unit.id,
          itemId: unit.itemId,
          unitCode: `HK-${String(unit.unitNumber).padStart(6, "0")}`,
          name: unit.name,
          serialNumber: unit.serialNumber,
          notes: unit.notes,
          updatedAt: unit.updatedAt,
        },
      },
      {
        headers: responseHeaders,
      },
    );
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json(
        {
          error: "INVALID_INPUT",
          message: "Data koreksi nama, nomor seri, atau deskripsi unit tidak valid.",
        },
        {
          status: 400,
          headers: responseHeaders,
        },
      );
    }

    if (error instanceof ItemUnitNotFoundError) {
      return Response.json(
        {
          error: "ITEM_UNIT_NOT_FOUND",
          message: error.message,
        },
        {
          status: 404,
          headers: responseHeaders,
        },
      );
    }

    throw error;
  }
}
