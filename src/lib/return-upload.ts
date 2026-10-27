import { z } from "zod";
import { receiveReturnInputSchema } from "@/server/receive-return-input";
import { prepareUnitPhotoUpload } from "@/lib/stock-upload";

export type ReturnPayload = z.infer<typeof receiveReturnInputSchema>;

export async function prepareReturnUpload(payload: ReturnPayload, photos: File[][]) {
  const data = receiveReturnInputSchema.parse(payload);
  if (photos.length !== data.lines.length) throw new Error("Kelompok foto tidak sesuai dengan unit yang dipilih.");
  if (data.lines.some((line, index) => line.condition !== "GOOD" && photos[index].length === 0)) {
    throw new Error("Foto wajib untuk setiap unit dengan kondisi selain baik.");
  }
  return prepareUnitPhotoUpload(data, photos, { allowEmptyPhotos: true });
}

const receiptSchema = z.object({
  receipt: z.object({
    id: z.uuid(), guestVisitId: z.uuid(), defaultLocationId: z.uuid(),
    receivedAt: z.iso.datetime({ offset: true }),
    lines: z.array(z.object({
      borrowingLineId: z.uuid(),
      condition: z.enum(["GOOD", "MINOR_DAMAGE", "DAMAGED", "MISSING_PART"]),
      locationId: z.uuid(),
    })).min(1).max(100),
  }),
  replayed: z.boolean(),
});

export function confirmedReturn(body: unknown, payload: ReturnPayload) {
  const parsed = receiptSchema.safeParse(body);
  if (!parsed.success) return false;
  const { receipt } = parsed.data;
  const lines = new Map(receipt.lines.map(line => [line.borrowingLineId, line]));
  return receipt.id === payload.requestId && receipt.guestVisitId === payload.guestVisitId &&
    receipt.defaultLocationId === payload.defaultLocationId && receipt.lines.length === payload.lines.length &&
    lines.size === payload.lines.length && new Set(payload.lines.map(line => line.borrowingLineId)).size === payload.lines.length && payload.lines.every(line => {
      const saved = lines.get(line.borrowingLineId);
      return saved?.condition === line.condition && saved.locationId === (line.locationId ?? payload.defaultLocationId);
    });
}

const choiceSchema = z.object({
  id: z.uuid(), status: z.literal("OUTSTANDING"),
  unit: z.object({
    id: z.uuid(), name: z.string().nullable(), serialNumber: z.string().nullable(),
    unitCode: z.string(), item: z.object({ name: z.string() }),
    condition: z.enum(["GOOD", "MINOR_DAMAGE", "DAMAGED", "MISSING_PART"]),
    custody: z.enum(["HOUSEKEEPING", "GUEST", "ENGINEERING", "EXTERNAL_VENDOR"]),
    lossState: z.enum(["NONE", "MISSING", "LOST"]),
  }),
  borrowing: z.object({ issuedAt: z.iso.datetime({ offset: true }), issuedBy: z.object({ name: z.string() }) }),
});
export type ReturnUnitChoice = z.infer<typeof choiceSchema>;

const choicePageSchema = z.object({
  visit: z.object({ id: z.uuid() }),
  lines: z.array(choiceSchema).max(10),
  pagination: z.object({
    page: z.number().int().positive(), pageSize: z.literal(10),
    total: z.number().int().nonnegative(), totalPages: z.number().int().nonnegative(), hasNextPage: z.boolean(),
  }),
});

export function parseOutstandingBorrowings(body: unknown, visitId: string, page: number) {
  const parsed = choicePageSchema.safeParse(body);
  if (!parsed.success || parsed.data.visit.id !== visitId || parsed.data.pagination.page !== page) return null;
  if (new Set(parsed.data.lines.map(line => line.id)).size !== parsed.data.lines.length) return null;
  return parsed.data;
}
