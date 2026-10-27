import { ZodError } from "zod";

import { authorizeApi } from "@/server/authorize-api";
import { PayloadTooLargeError } from "@/server/read-json-body";
import { readUnitPhotoForm } from "@/server/read-unit-photo-form";
import {
  reportUnitDamage,
  UnitDamageReportError,
} from "@/server/report-unit-damage";
import { reportUnitDamageInputSchema } from "@/server/report-unit-damage-input";
import { InvalidUnitPhotoError } from "@/server/unit-photo";
import { validateMutationRequest } from "@/server/validate-mutation-request";

const headers = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const authorization = await authorizeApi(
    "inventory:unit:damage:report",
  );
  if (!authorization.authorized) return authorization.response;

  const rejected = validateMutationRequest(request, ["multipart/form-data"]);
  if (rejected) return rejected;

  let body: unknown;
  let photos: File[][];

  try {
    const parsed = await readUnitPhotoForm(
      request,
      (raw) => reportUnitDamageInputSchema.parse(raw),
      () => 1,
    );
    body = parsed.body;
    photos = parsed.photos;
  } catch (error) {
    const tooLarge = error instanceof PayloadTooLargeError;

    if (
      !tooLarge &&
      !(error instanceof SyntaxError) &&
      !(error instanceof TypeError) &&
      !(error instanceof ZodError)
    ) {
      throw error;
    }

    return Response.json(
      {
        error: tooLarge ? "PAYLOAD_TOO_LARGE" : "INVALID_INPUT",
        message: tooLarge
          ? "Metadata maksimal 256 KiB; total multipart maksimal 16 MiB."
          : "Periksa unit, kondisi, catatan, dan foto laporan.",
        ...(error instanceof ZodError
          ? {
              issues: error.issues.map((issue) => ({
                path: issue.path.join("."),
                message: issue.message,
              })),
            }
          : {}),
      },
      { status: tooLarge ? 413 : 400, headers },
    );
  }

  try {
    const result = await reportUnitDamage(
      body,
      authorization.user.id,
      photos[0] ?? [],
    );

    return Response.json(result, {
      status: result.replayed ? 200 : 201,
      headers,
    });
  } catch (error) {
    if (error instanceof InvalidUnitPhotoError) {
      return Response.json(
        { error: "INVALID_PHOTO", message: error.message },
        { status: 400, headers },
      );
    }

    if (error instanceof UnitDamageReportError) {
      return Response.json(
        { error: error.code, message: error.message },
        {
          status: error.code === "UNIT_NOT_FOUND" ? 404 : 409,
          headers,
        },
      );
    }

    throw error;
  }
}
