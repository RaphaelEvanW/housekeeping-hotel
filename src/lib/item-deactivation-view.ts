import { z } from "zod";

const submissionSchema = z.object({
  deactivationRequest: z.object({
    id: z.uuid(),
    itemId: z.uuid(),
    requestedById: z.string(),
    status: z.literal("PENDING"),
    reason: z.string(),
  }),
});

export function confirmedDeactivationRequest(
  body: unknown,
  itemId: string,
  actorId: string,
  reason: string,
) {
  const result = submissionSchema.safeParse(body);

  if (!result.success) return null;

  const request = result.data.deactivationRequest;

  return request.itemId === itemId &&
    request.requestedById === actorId &&
    request.reason === reason
    ? request
    : null;
}
