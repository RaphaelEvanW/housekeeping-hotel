import { z } from "zod";

const checkoutSchema = z.object({
  visit: z.object({ id: z.uuid(), status: z.literal("CHECKED_OUT"), checkedOutAt: z.iso.datetime({ offset: true }) }),
  outstandingLines: z.number().int().nonnegative(),
  alreadyCheckedOut: z.boolean(),
});

export function confirmedGuestCheckout(body: unknown, visitId: string) {
  const parsed = checkoutSchema.safeParse(body);
  return parsed.success && parsed.data.visit.id === visitId ? parsed.data : null;
}
