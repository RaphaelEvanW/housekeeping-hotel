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

import { listItems } from "@/server/list-items";
import { listItemsInputSchema } from "@/server/list-items-input";
import { readItemForm } from "@/server/read-item-form";
import { InvalidItemPhotoError, prepareItemPhoto } from "@/server/item-photo";

export async function GET(request: Request) {
  const authorization = await authorizeApi("inventory:view");

  if (!authorization.authorized) {
    return authorization.response;
  }

  const searchParams = new URL(request.url).searchParams;

  const parsed = listItemsInputSchema.safeParse({
    page: searchParams.get("page") ?? undefined,
    pageSize: searchParams.get("pageSize") ?? undefined,
    q: searchParams.get("q") ?? undefined,
  });

  if (!parsed.success) {
    return Response.json(
      {
        error: "INVALID_INPUT",
        message: "Parameter pencarian atau halaman tidak valid.",
      },
      {
        status: 400,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }

  const result = await listItems(parsed.data);

  return Response.json(result, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  const authorization = await authorizeApi("inventory:item:create");

  if (!authorization.authorized) {
    return authorization.response;
  }

  const rejectedRequest = validateMutationRequest(request, ["application/json", "multipart/form-data"]);

  if (rejectedRequest) {
    return rejectedRequest;
  }

  let body: unknown;
  let photo: File | undefined;
  const multipart = request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data") ?? false;

  try {
    if (multipart) {
      const form = await readItemForm(request);
      if (["name", "description", "photo"].some(key => form.getAll(key).length > 1)) throw new SyntaxError("Duplicate fields");
      body = { name: form.get("name"), description: form.get("description") ?? undefined };
      const entry = form.get("photo");
      if (entry !== null && !(entry instanceof File)) throw new SyntaxError("Invalid photo field");
      if (entry instanceof File && (entry.size > 0 || entry.name)) photo = entry;
    } else {
      body = await readJsonBody(request);
    }
  } catch (error) {
    const tooLarge = error instanceof PayloadTooLargeError;

    return Response.json(
      {
        error: tooLarge ? "PAYLOAD_TOO_LARGE" : "INVALID_INPUT",
        message: tooLarge
          ? (multipart ? "Foto maksimal 2 MiB dan data form harus sesuai batas." : "Ukuran data maksimal 256 KiB.")
          : (multipart ? "Data form tidak valid." : "Format JSON tidak valid."),
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
    const preparedPhoto = photo ? await prepareItemPhoto(photo) : undefined;
    const { photoKey, ...created } = await createItem(parsed.data.name, authorization.user.id, { description: parsed.data.description, photo: preparedPhoto });
    const item = { ...created, photoUrl: photoKey ? `/api/items/${created.id}/photo` : null };

    return Response.json(
      { item },
      {
        status: 201,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    if (error instanceof InvalidItemPhotoError) {
      return Response.json({ error: "INVALID_PHOTO", message: error.message }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
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
