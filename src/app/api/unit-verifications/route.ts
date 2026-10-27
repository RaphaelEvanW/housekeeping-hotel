import { ZodError } from "zod";

import { authorizeApi } from "@/server/authorize-api";
import { PayloadTooLargeError } from "@/server/read-json-body";
import { readUnitPhotoForm } from "@/server/read-unit-photo-form";
import { InvalidUnitPhotoError } from "@/server/unit-photo";
import { validateMutationRequest } from "@/server/validate-mutation-request";
import { verifyUnits, VerifyUnitsError } from "@/server/verify-units";
import {
  verifyUnitsInputSchema,
  type VerifyUnitsInput,
} from "@/server/verify-units-input";

const headers = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const authorization = await authorizeApi("inspection:verify");
  if (!authorization.authorized) return authorization.response;

  const rejected = validateMutationRequest(request, ["multipart/form-data"]);
  if (rejected) return rejected;

  let body: VerifyUnitsInput;
  let photos: File[][];

  try {
    const parsed = await readUnitPhotoForm(
      request,
      (raw) => verifyUnitsInputSchema.parse(raw),
      (input) => input.units.length,
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
          : "Periksa unit, versi data, hasil, catatan, dan foto verifikasi.",
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
    const result = await verifyUnits(body, authorization.user.id, photos);

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

    if (error instanceof VerifyUnitsError) {
      const status =
        error.code === "PHOTOS_REQUIRED"
          ? 400
          : error.code === "UNITS_NOT_FOUND"
            ? 404
            : 409;

      return Response.json(
        { error: error.code, message: error.message },
        { status, headers },
      );
    }

    throw error;
  }
}
