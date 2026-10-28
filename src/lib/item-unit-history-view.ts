import { z } from "zod";
import { conditionLabels, custodyLabels, readinessLabels } from "@/lib/unit-state-labels";

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
        photos: z.array(z.object({ id: z.string().min(1), url: z.string() })).optional(),
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
    data.events.length > pagination.total ||
    data.events.some(event => {
      const photos = event.photos ?? [];
      return new Set(photos.map(photo => photo.id)).size !== photos.length || photos.some(photo =>
        photo.url !== `/api/item-units/${encodeURIComponent(unitId)}/photos/${encodeURIComponent(photo.id)}`,
      );
    })
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
    case "BORROWING_ISSUED":
      return "Unit dipinjamkan";
    case "BORROWING_RETURNED":
      return "Unit dikembalikan";
    case "ITEM_UNIT_DAMAGE_REPORTED":
      return "Kerusakan dilaporkan";
    case "ITEM_UNIT_CONDITION_UPDATED":
      return "Kondisi unit diperbarui";
    case "ITEM_UNIT_VERIFIED":
      return "Unit diverifikasi";
    case "ITEM_UNIT_SENT_TO_ENGINEERING":
      return "Unit diserahkan ke Engineering";
    case "ITEM_UNIT_RECEIVED_FROM_ENGINEERING":
      return "Unit diterima dari Engineering";
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

const operationalActions = new Set([
  "BORROWING_ISSUED",
  "BORROWING_RETURNED",
  "ITEM_UNIT_DAMAGE_REPORTED",
  "ITEM_UNIT_CONDITION_UPDATED",
  "ITEM_UNIT_VERIFIED",
  "ITEM_UNIT_SENT_TO_ENGINEERING",
  "ITEM_UNIT_RECEIVED_FROM_ENGINEERING",
]);

const historyValueLabels: Record<string, Readonly<Record<string, string>>> = {
  condition: conditionLabels,
  conditionAtIssue: conditionLabels,
  readiness: readinessLabels,
  custody: custodyLabels,
  result: {
    FIT_FOR_USE: "Layak digunakan",
    UNFIT_FOR_USE: "Tidak layak digunakan",
  },
};

const photoLabels: Record<string, string> = {
  STOCK_UNIT_CREATED: "Foto awal unit",
  BORROWING_ISSUED: "Foto peminjaman",
  BORROWING_RETURNED: "Foto pengembalian",
  ITEM_UNIT_DAMAGE_REPORTED: "Foto laporan kerusakan",
  ITEM_UNIT_CONDITION_UPDATED: "Foto kondisi unit",
  ITEM_UNIT_VERIFIED: "Foto verifikasi",
  ITEM_UNIT_SENT_TO_ENGINEERING: "Foto bukti kerusakan",
  ITEM_UNIT_RECEIVED_FROM_ENGINEERING: "Foto penerimaan unit",
};

const historyTime = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Jakarta",
});

function formattedHistoryValue(values: unknown, key: string) {
  const value = detailValue(values, key);
  if (value === null || value === undefined) return value;

  const labels = historyValueLabels[key];
  if (!labels) return value;

  return Object.prototype.hasOwnProperty.call(labels, value)
    ? labels[value]
    : undefined;
}

export function historyEventDetails(event: UnitHistoryEvent) {
  const facts: { key: string; label: string; value: string }[] = [];
  if (!operationalActions.has(event.action)) {
    return {
      facts,
      visitHref: null,
      photoLabel: photoLabels[event.action] ?? "Foto aktivitas",
    };
  }

  const borrowing =
    event.action === "BORROWING_ISSUED" ||
    event.action === "BORROWING_RETURNED";
  const fields: [string, string][] = borrowing
    ? [
        ["primaryGuestNameSnapshot", "Tamu"],
        ["roomNumberSnapshot", "Kamar"],
      ]
    : [];

  fields.push([
    event.action === "BORROWING_ISSUED" ? "conditionAtIssue" : "condition",
    event.action === "BORROWING_ISSUED"
      ? "Kondisi saat dipinjamkan"
      : event.action === "BORROWING_RETURNED"
        ? "Kondisi saat dikembalikan"
        : "Kondisi tercatat",
  ]);
  if (event.action !== "BORROWING_ISSUED") {
    fields.push(["readiness", "Kesiapan setelah kejadian"]);
  }
  if (event.action === "ITEM_UNIT_VERIFIED") {
    fields.unshift(["result", "Hasil verifikasi"]);
  }
  if (event.action === "ITEM_UNIT_SENT_TO_ENGINEERING") {
    fields.unshift(["handedOverTo", "Penerima di Engineering"]);
  }
  if (event.action === "ITEM_UNIT_RECEIVED_FROM_ENGINEERING") {
    fields.unshift(
      ["receivedFrom", "Diserahkan oleh"],
      ["performedBy", "Pelaksana perbaikan"],
    );
  }

  for (const [key, label] of fields) {
    const value = formattedHistoryValue(event.newValues, key);
    if (typeof value === "string" && value.trim()) {
      facts.push({ key, label, value });
    }
  }

  if (event.action === "BORROWING_RETURNED") {
    const receivedAt = z
      .iso.datetime({ offset: true })
      .safeParse(detailValue(event.newValues, "receivedAt"));
    if (receivedAt.success) {
      facts.push({
        key: "receivedAt",
        label: "Diterima kembali",
        value: `${historyTime.format(new Date(receivedAt.data))} WIB`,
      });
    }
  }

  if (
    event.action === "ITEM_UNIT_SENT_TO_ENGINEERING" ||
    event.action === "ITEM_UNIT_RECEIVED_FROM_ENGINEERING"
  ) {
    const timestamps: [string, string][] = [
      [
        "occurredAt",
        event.action === "ITEM_UNIT_SENT_TO_ENGINEERING"
          ? "Waktu penyerahan"
          : "Waktu penerimaan",
      ],
      ["workCompletedAt", "Pekerjaan selesai"],
    ];

    for (const [key, label] of timestamps) {
      const parsed = z.iso.datetime({ offset: true }).safeParse(
        detailValue(event.newValues, key),
      );

      if (parsed.success) {
        facts.push({
          key,
          label,
          value: `${historyTime.format(new Date(parsed.data))} WIB`,
        });
      }
    }
  }

  const visitId = borrowing
    ? z.uuid().safeParse(detailValue(event.newValues, "guestVisitId"))
    : null;

  return {
    facts,
    visitHref: visitId?.success ? `/guests/${visitId.data}?status=ALL#riwayat-peminjaman` : null,
    photoLabel: photoLabels[event.action] ?? "Foto aktivitas",
  };
}

export function historyChanges(event: UnitHistoryEvent) {
  const operational = operationalActions.has(event.action);
  if (
    event.action !== "STOCK_UNIT_CREATED" &&
    event.action !== "ITEM_UNIT_DETAILS_UPDATED" &&
    !operational
  ) {
    return [];
  }

  const fields: readonly (readonly [string, string])[] = operational
    ? [
        ["condition", "Kondisi"],
        ["readiness", "Kesiapan"],
        ["custody", "Pemegang unit"],
      ]
    : [
        ["name", "Nama unit"],
        ["serialNumber", "Nomor seri"],
        ["notes", "Deskripsi"],
      ];

  return fields.flatMap(([key, label]) => {
    const before = formattedHistoryValue(event.oldValues, key);
    const after = formattedHistoryValue(event.newValues, key);

    if (event.action === "STOCK_UNIT_CREATED") {
      return after ? [{ key, label, before: null, after }] : [];
    }

    if (before === undefined || after === undefined || before === after) {
      return [];
    }

    return [{ key, label, before, after }];
  });
}
