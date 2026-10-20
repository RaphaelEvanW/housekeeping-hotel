import { z } from "zod";

import { authorizeApi } from "@/server/authorize-api";
import { getItemUnits } from "@/server/item-units";

const inputSchema = z.object({
  itemId: z.string().uuid(),
  after: z
    .string()
    .regex(/^[1-9]\d*$/)
    .transform(Number)
    .pipe(z.number().int().positive().max(2_147_483_647))
    .optional(),
});

const responseHeaders = {
  "Cache-Control": "no-store",
};

export async function GET(
  request: Request,
  context: {
    params: Promise<{ itemId: string }>;
  },
) {
  const authorization = await authorizeApi("inventory:view");

  if (!authorization.authorized) {
    return authorization.response;
  }

  const { itemId } = await context.params;
  const url = new URL(request.url);

  const parsed = inputSchema.safeParse({
    itemId,
    after: url.searchParams.get("after") ?? undefined,
  });

  if (!parsed.success) {
    return Response.json(
      {
        error: "INVALID_INPUT",
        message: "ID barang atau parameter halaman tidak valid.",
      },
      {
        status: 400,
        headers: responseHeaders,
      },
    );
  }

  const result = await getItemUnits(
    parsed.data.itemId,
    parsed.data.after,
  );

  if (!result) {
    return Response.json(
      {
        error: "ITEM_NOT_FOUND",
        message: "Jenis barang tidak ditemukan.",
      },
      {
        status: 404,
        headers: responseHeaders,
      },
    );
  }

  return Response.json(result, {
    headers: responseHeaders,
  });
}