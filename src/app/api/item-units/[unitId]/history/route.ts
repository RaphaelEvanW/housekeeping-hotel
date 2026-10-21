import { ZodError } from "zod";

import { authorizeApi } from "@/server/authorize-api";
import { getItemUnitHistory } from "@/server/item-unit-history";

const responseHeaders = {
  "Cache-Control": "no-store",
};

export async function GET(
  request: Request,
  context: { params: Promise<{ unitId: string }> },
) {
  const authorization = await authorizeApi("inventory:view");

  if (!authorization.authorized) {
    return authorization.response;
  }

  const { unitId } = await context.params;
  const searchParams = new URL(request.url).searchParams;

  try {
    const result = await getItemUnitHistory({
      unitId,
      page: searchParams.get("page") ?? undefined,
      pageSize: searchParams.get("pageSize") ?? undefined,
    });

    if (!result) {
      return Response.json(
        {
          error: "ITEM_UNIT_NOT_FOUND",
          message: "Unit barang tidak ditemukan.",
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
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json(
        {
          error: "INVALID_INPUT",
          message: "ID unit atau parameter halaman tidak valid.",
        },
        {
          status: 400,
          headers: responseHeaders,
        },
      );
    }

    throw error;
  }
}