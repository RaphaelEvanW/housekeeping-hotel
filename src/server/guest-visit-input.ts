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
export const registerGuestVisitInputSchema = z
  .object({
    requestId: guestVisitIdSchema,
    primaryGuestName: text(200),
    roomNumber: text(30),
    bookingNumber: text(100),
    checkInDate: date,
    plannedCheckoutDate: date,
    duplicateOverrideReason: z.string().trim().min(1).max(2000).optional(),
  })
  .strict()
  .refine((input) => input.plannedCheckoutDate >= input.checkInDate, {
    path: ["plannedCheckoutDate"],
    message: "Tanggal checkout tidak boleh sebelum tanggal check-in.",
  });
