import { ZodError } from "zod";

import { authorizeApi } from "@/server/authorize-api";
import { listItemDeactivationRequests } from "@/server/list-item-deactivation";

const responseHeaders = {
  "Cache-Control": "no-store",
};

export async function GET(request: Request) {
  const authorization = await authorizeApi("inventory:view");

  if (!authorization.authorized) {
    return authorization.response;
  }

  const searchParams = new URL(request.url).searchParams;

  try {
    const result = await listItemDeactivationRequests({
      page: searchParams.get("page") ?? undefined,
      pageSize: searchParams.get("pageSize") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      itemId: searchParams.get("itemId") ?? undefined,
    });

    return Response.json(result, {
      headers: responseHeaders,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json(
        {
          error: "INVALID_INPUT",
          message: "Parameter daftar pengajuan tidak valid.",
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
