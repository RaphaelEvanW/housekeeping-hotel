import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";

const nameIndex = z.literal("item_normalizedName_key");
const nameFields = z.tuple([z.literal("normalizedName")]);
const conflictMetadata = z.union([
  z.object({ target: z.union([nameIndex, nameFields, z.literal("normalizedName")]) }),
  z.object({
    driverAdapterError: z.object({
      cause: z.object({
        kind: z.literal("UniqueConstraintViolation"),
        constraint: z.union([z.object({ index: nameIndex }), z.object({ fields: nameFields })]),
      }),
    }),
  }),
]);

export function isItemNameConflict(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002" && conflictMetadata.safeParse(error.meta).success;
}
