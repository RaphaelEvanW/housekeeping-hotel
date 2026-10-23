import { z } from "zod";

export const deactivationActions = {
  APPROVE: {
    label: "Setujui", heading: "Setujui penonaktifan", confirm: "Setujui penonaktifan",
    status: "APPROVED", success: "Pengajuan disetujui. Jenis barang sudah nonaktif.",
    effect: "Persetujuan akan menonaktifkan jenis barang. Unit fisik dan riwayatnya tetap tersimpan; status unit tidak diubah.",
  },
  REJECT: {
    label: "Tolak", heading: "Tolak pengajuan", confirm: "Tolak pengajuan",
    status: "REJECTED", success: "Pengajuan berhasil ditolak.",
    effect: "Pengajuan akan ditolak tanpa menonaktifkan jenis barang.",
  },
  CANCEL: {
    label: "Batalkan", heading: "Batalkan pengajuan", confirm: "Batalkan pengajuan",
    status: "CANCELLED", success: "Pengajuan berhasil dibatalkan.",
    effect: "Pengajuan Anda akan dibatalkan tanpa menonaktifkan jenis barang.",
  },
} as const;

export type DeactivationAction = keyof typeof deactivationActions;

export function deactivationMutation(action: DeactivationAction) {
  return action === "CANCEL"
    ? { segment: "cancel", body: {} }
    : { segment: "decision", body: { decision: action } };
}

const decisionSchema = z.object({
  deactivationRequest: z.object({
    id: z.uuid(), itemId: z.uuid(), decidedById: z.string(),
    status: z.enum(["APPROVED", "REJECTED", "CANCELLED"]),
    decidedAt: z.iso.datetime({ offset: true }),
  }),
});

export function confirmedDeactivationAction(body: unknown, expected: {
  requestId: string; itemId: string; actorId: string; action: DeactivationAction;
}) {
  const parsed = decisionSchema.safeParse(body);
  if (!parsed.success) return null;
  const request = parsed.data.deactivationRequest;
  return request.id === expected.requestId && request.itemId === expected.itemId &&
    request.decidedById === expected.actorId && request.status === deactivationActions[expected.action].status
    ? request : null;
}
