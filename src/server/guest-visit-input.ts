import { z } from "zod";

const date = z.iso.date().refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}, "Tanggal tidak valid.");
const text = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .transform((value) => value.replace(/\s+/gu, " "));

export const guestVisitIdSchema = z.string().uuid();
export const checkoutGuestVisitInputSchema = z
  .object({ acknowledgeOutstanding: z.boolean().default(false) })
  .strict();
export const updateGuestVisitInputSchema = z
  .object({
    expectedUpdatedAt: z.iso.datetime(),
    primaryGuestName: text(200).optional(),
    roomNumber: text(30).optional(),
    reason: z.string().trim().min(1).max(2000),
    // Existing FE sends false; acknowledgement can no longer bypass a conflict.
    acknowledgeDuplicate: z.literal(false).default(false),
  })
  .strict()
  .refine(
    (input) =>
      input.primaryGuestName !== undefined || input.roomNumber !== undefined,
    {
      path: ["primaryGuestName"],
      message: "Isi nama primary guest atau nomor kamar yang ingin diubah.",
    },
  );

export const registerGuestVisitInputSchema = z
  .object({
    requestId: guestVisitIdSchema,
    primaryGuestName: text(200),
    roomNumber: text(30),
    bookingNumber: text(100),
    checkInDate: date,
    plannedCheckoutDate: date,
  })
  .strict()
  .refine((input) => input.plannedCheckoutDate >= input.checkInDate, {
    path: ["plannedCheckoutDate"],
    message: "Tanggal checkout tidak boleh sebelum tanggal check-in.",
  });
