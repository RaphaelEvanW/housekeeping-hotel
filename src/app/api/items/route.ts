import { createItemInputSchema } from "@/server/item-input";
import { validateMutationRequest } from "@/server/validate-mutation-request";

import {
  PayloadTooLargeError,
  readJsonBody,
} from "@/server/read-json-body";

import { authorizeApi } from "@/server/authorize-api";
import {
  createItem,
  DuplicateItemNameError,
} from "@/server/items";
import { db } from "@/server/db";

export async function GET() {
  const authorization = await authorizeApi("inventory:view");

  if (!authorization.authorized) {
    return authorization.response;
  }

  const items = await db.item.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return Response.json(
    { items },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const authorization = await authorizeApi("inventory:item:create");

  if (!authorization.authorized) {
    return authorization.response;
  }

  const rejectedRequest = validateMutationRequest(request);

  if (rejectedRequest) {
    return rejectedRequest;
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
        headers: { "Cache-Control": "no-store" },
      },
    );
  }

  const parsed = createItemInputSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json(
      {
        error: "INVALID_INPUT",
        message:
          parsed.error.issues[0]?.message ??
          "Data jenis barang tidak valid.",
      },
      {
        status: 400,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }

  try {
    const item = await createItem(parsed.data.name, authorization.user.id);

    return Response.json(
      { item },
      {
        status: 201,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    if (error instanceof DuplicateItemNameError) {
      return Response.json(
        {
          error: "ITEM_NAME_EXISTS",
          message: "Jenis barang dengan nama tersebut sudah ada.",
        },
        { status: 409 },
      );
    }

    throw error;
  }
}
