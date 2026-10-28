import { z } from "zod";

const timestamp = z
  .string()
  .datetime({ offset: true })
  .transform((value) => new Date(value).toISOString());
const person = z.string().trim().min(1).max(100);
const description = z.string().trim().min(1).max(2000);

const common = {
  requestId: z.string().uuid(),
  expectedUpdatedAt: timestamp,
  occurredAt: timestamp,
};

export const handoverUnitInputSchema = z
  .object({
    ...common,
    unitId: z.string().uuid(),
    condition: z.enum(["MINOR_DAMAGE", "DAMAGED", "MISSING_PART"]),
    handedOverTo: person,
    notes: description,
  })
  .strict();

export const receiveMaintainedUnitInputSchema = z
  .object({
    ...common,
    handoverId: z.string().uuid(),
    locationId: z.string().uuid(),
    condition: z.enum(["GOOD", "MINOR_DAMAGE", "DAMAGED", "MISSING_PART"]),
    receivedFrom: person,
    workPerformed: description,
    performedBy: person.nullable().default(null),
    workCompletedAt: timestamp.nullable().default(null),
  })
  .strict()
  .superRefine((input, context) => {
    if ((input.performedBy === null) !== (input.workCompletedAt === null)) {
      context.addIssue({
        code: "custom",
        path: ["performedBy"],
        message: "Pelaksana dan waktu selesai pekerjaan harus diisi bersama.",
      });
    }
  });

export const maintenanceIdSchema = z.string().uuid();

export type HandoverUnitInput = z.infer<typeof handoverUnitInputSchema>;
export type ReceiveMaintainedUnitInput = z.infer<
  typeof receiveMaintainedUnitInputSchema
>;
