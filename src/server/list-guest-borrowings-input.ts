import { z } from "zod";

import { guestVisitIdSchema } from "@/server/guest-visit-input";
import { listGuestVisitsInputSchema } from "@/server/list-guest-visits-input";

export const listGuestBorrowingsInputSchema = listGuestVisitsInputSchema
  .pick({ page: true, pageSize: true })
  .extend({
    visitId: guestVisitIdSchema,
    status: z.enum(["ALL", "OUTSTANDING", "RETURNED", "SETTLED"]).default("ALL"),
  })
  .strict();
