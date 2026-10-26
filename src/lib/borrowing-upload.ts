import { z } from "zod";
import { issueBorrowingInputSchema } from "@/server/issue-borrowing-input";
import { prepareUnitPhotoUpload } from "@/lib/stock-upload";

export type BorrowingPayload = z.infer<typeof issueBorrowingInputSchema>;

export async function prepareBorrowingUpload(payload: BorrowingPayload, photos: File[][]) {
  const data = issueBorrowingInputSchema.parse(payload);
  if (photos.length !== data.unitIds.length) throw new Error("Lengkapi foto setiap unit yang dipilih.");
  return prepareUnitPhotoUpload(data, photos);
}

const successSchema = z.object({
  borrowing: z.object({
    id: z.uuid(), guestVisitId: z.uuid(),
    lines: z.array(z.object({ unitId: z.uuid() })).min(1).max(100),
  }),
  replayed: z.boolean(),
});

export function confirmedBorrowing(body: unknown, payload: BorrowingPayload) {
  const parsed = successSchema.safeParse(body);
  if (!parsed.success) return false;
  const { borrowing } = parsed.data;
  const received = new Set(borrowing.lines.map(line => line.unitId));
  return borrowing.id === payload.requestId && borrowing.guestVisitId === payload.guestVisitId &&
    borrowing.lines.length === payload.unitIds.length && received.size === payload.unitIds.length &&
    payload.unitIds.every(id => received.has(id));
}
