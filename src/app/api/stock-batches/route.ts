import { ZodError } from "zod";

import { authorizeApi } from "@/server/authorize-api";
import { addStock, AddStockError } from "@/server/add-stock";

const responseHeaders = {
  "Cache-Control": "no-store",
};

export async function POST(request: Request) {
  const authorization = await authorizeApi("inventory:stock:add");

  if (!authorization.authorized) {
    return authorization.response;
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json(
      {
        error: "INVALID_INPUT",
        message: "Format JSON tidak valid.",
      },
      {
        status: 400,
        headers: responseHeaders,
      },
    );
  }

  try {
    const result = await addStock(body, authorization.user.id);

    return Response.json(result, {
      status: result.replayed ? 200 : 201,
      headers: responseHeaders,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json(
        {
          error: "INVALID_INPUT",
          message: "Periksa kembali data penambahan stok.",
          issues: error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
        {
          status: 400,
          headers: responseHeaders,
        },
      );
    }

    if (error instanceof AddStockError) {
      const statusByCode = {
        REQUEST_CONFLICT: 409,
        ITEM_NOT_FOUND: 404,
        ITEM_INACTIVE: 409,
        STORAGE_UNAVAILABLE: 409,
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