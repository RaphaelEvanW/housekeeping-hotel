import { ZodError } from "zod";

import { authorizeApi } from "@/server/authorize-api";
import {
  issueBorrowing,
  IssueBorrowingError,
} from "@/server/issue-borrowing";
import { issueBorrowingInputSchema } from "@/server/issue-borrowing-input";
import { PayloadTooLargeError } from "@/server/read-json-body";
import { readUnitPhotoForm } from "@/server/read-unit-photo-form";
import { InvalidUnitPhotoError } from "@/server/unit-photo";
import { validateMutationRequest } from "@/server/validate-mutation-request";

const headers = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const authorization = await authorizeApi("borrowing:create");
  if (!authorization.authorized) return authorization.response;

  const rejected = validateMutationRequest(request, ["multipart/form-data"]);
  if (rejected) return rejected;

  let body: unknown;
  let photos: File[][];

  try {
    const parsed = await readUnitPhotoForm(
      request,
      raw => issueBorrowingInputSchema.parse(raw),
      input => input.unitIds.length,
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

    return Response.json({
      error: tooLarge ? "PAYLOAD_TOO_LARGE" : "INVALID_INPUT",
      message: tooLarge
        ? "Metadata maksimal 256 KiB; total multipart maksimal 16 MiB."
        : "Periksa kembali data peminjaman.",
      ...(error instanceof ZodError ? {
        issues: error.issues.map(issue => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      } : {}),
    }, {
      status: tooLarge ? 413 : 400,
      headers,
    });
  }

  try {
    const result = await issueBorrowing(
      body,
      authorization.user.id,
      photos,
    );

    return Response.json(result, {
      status: result.replayed ? 200 : 201,
      headers,
    });
  } catch (error) {
    if (error instanceof InvalidUnitPhotoError) {
      return Response.json({
        error: "INVALID_PHOTO",
        message: error.message,
      }, { status: 400, headers });
    }

    if (error instanceof IssueBorrowingError) {
      const statuses = {
        REQUEST_CONFLICT: 409,
        VISIT_NOT_FOUND: 404,
        VISIT_NOT_STAYING: 409,
        ITEM_INACTIVE: 409,
        UNITS_UNAVAILABLE: 409,
        PHOTOS_REQUIRED: 400,
        LOCATION_UNAVAILABLE: 409,
        RETRY_REQUIRED: 409,
      } as const;

      return Response.json({
        error: error.code,
        message: error.message,
      }, { status: statuses[error.code], headers });
    }

    throw error;
  }
}