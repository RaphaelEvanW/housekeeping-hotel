import { ZodError } from "zod";

import { authorizeApi } from "@/server/authorize-api";
import { getUnitMaintenance } from "@/server/unit-maintenance";

const headers = { "Cache-Control": "no-store" };

export async function GET(
  _request: Request,
  context: { params: Promise<{ handoverId: string }> },
) {
  const authorization = await authorizeApi("maintenance:view");
  if (!authorization.authorized) return authorization.response;

  const { handoverId } = await context.params;
  try {
    const result = await getUnitMaintenance(handoverId);
    if (!result) {
      return Response.json(
        {
          error: "HANDOVER_NOT_FOUND",
          message: "Catatan serah unit ke Engineering tidak ditemukan.",
        },
        { status: 404, headers },
      );
    }

    return Response.json(result, { headers });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json(
        { error: "INVALID_INPUT", message: "ID serah-terima tidak valid." },
        { status: 400, headers },
      );
    }
    throw error;
  }
}
