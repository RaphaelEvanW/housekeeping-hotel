import { z } from "zod";

export const HISTORY_PAGE_SIZE = 10;
export const HISTORY_MAX_PAGE = 1000;

const historySchema = z.object({
  unit: z.object({
    id: z.string(),
    unitCode: z.string(),
  }),
  events: z
    .array(
      z.object({
        id: z.string(),
        action: z.string(),
        reason: z.string().nullable(),
        oldValues: z.unknown(),
        newValues: z.unknown(),
        createdAt: z.iso.datetime({ offset: true }),
        actor: z.object({
          id: z.string(),
          name: z.string(),
        }),
      }),
    )
    .max(HISTORY_PAGE_SIZE),
  pagination: z.object({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
    hasNextPage: z.boolean(),
  }),
});

export type UnitHistoryData = z.infer<typeof historySchema>;
export type UnitHistoryEvent = UnitHistoryData["events"][number];

export function parseUnitHistory(
  body: unknown,
  unitId: string,
  unitCode: string,
  page: number,
): UnitHistoryData | null {
  const result = historySchema.safeParse(body);

  if (!result.success) return null;

  const data = result.data;
  const pagination = data.pagination;

  if (
    data.unit.id !== unitId ||
    data.unit.unitCode !== unitCode ||
    pagination.page !== page ||
    pagination.pageSize !== HISTORY_PAGE_SIZE ||
    pagination.totalPages !== Math.ceil(pagination.total / HISTORY_PAGE_SIZE) ||
    pagination.hasNextPage !== page * HISTORY_PAGE_SIZE < pagination.total ||
    data.events.length > pagination.total
  ) {
    return null;
  }

  return data;
}

export function historyEventTitle(action: string) {
  switch (action) {
    case "STOCK_UNIT_CREATED":
      return "Unit ditambahkan";
    case "ITEM_UNIT_DETAILS_UPDATED":
      return "Detail unit diperbarui";
    default:
      return "Aktivitas unit";
  }
}

function detailValue(values: unknown, key: string) {
  if (!values || typeof values !== "object" || Array.isArray(values)) {
    return undefined;
  }

  const value = (values as Record<string, unknown>)[key];

  return value === null || typeof value === "string" ? value : undefined;
}

export function historyChanges(event: UnitHistoryEvent) {
  if (
    event.action !== "STOCK_UNIT_CREATED" &&
    event.action !== "ITEM_UNIT_DETAILS_UPDATED"
  ) {
    return [];
  }

  const fields = [
    ["serialNumber", "Nomor seri"],
    ["notes", "Deskripsi"],
  ] as const;

  return fields.flatMap(([key, label]) => {
    const before = detailValue(event.oldValues, key);
    const after = detailValue(event.newValues, key);

    if (event.action === "STOCK_UNIT_CREATED") {
      return after ? [{ key, label, before: null, after }] : [];
    }

    if (before === undefined || after === undefined || before === after) {
      return [];
    }

    return [{ key, label, before, after }];
  });
}
