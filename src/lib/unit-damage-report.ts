import { z } from "zod";
import { reportUnitDamageInputSchema } from "@/server/report-unit-damage-input";

export type DamageReportPayload = z.infer<
  typeof reportUnitDamageInputSchema
>;

const responseSchema = z.object({
  report: z.object({
    id: z.uuid(),
    unitId: z.uuid(),
    notes: z.string(),
    reportedAt: z.iso.datetime({ offset: true }),
    reportedBy: z.object({
      id: z.uuid(),
      name: z.string(),
    }),
    photos: z.array(
      z.object({
        id: z.uuid(),
        url: z.string(),
      }),
    ),
  }),
  replayed: z.boolean(),
});

export function confirmedDamageReport(
  body: unknown,
  payload: Pick<DamageReportPayload, "requestId" | "unitId" | "notes">,
  photoCount: number,
) {
  const parsed = responseSchema.safeParse(body);
  if (!parsed.success) return false;

  const { report } = parsed.data;

  return (
    report.id === payload.requestId &&
    report.unitId === payload.unitId &&
    report.notes === payload.notes &&
    report.photos.length === photoCount &&
    new Set(report.photos.map((photo) => photo.id)).size === photoCount &&
    report.photos.every(
      (photo) =>
        photo.url ===
        `/api/item-units/${payload.unitId}/photos/${photo.id}`,
    )
  );
}
