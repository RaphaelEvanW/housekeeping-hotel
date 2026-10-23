"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type SubmitEvent } from "react";
import { createPortal } from "react-dom";

import { ItemNameDisclosure } from "@/components/item-name-disclosure";
import { WorkspaceControlIcon } from "@/components/workspace-control-icon";
import { confirmedDeactivationAction, deactivationActions, deactivationMutation, type DeactivationAction } from "@/lib/item-deactivation-actions";

type RequestSummary = {
  id: string;
  itemId: string;
  itemName: string;
  reason: string;
  requestedBy: string;
  createdAt: string;
};
type Outcome = "editing" | "success" | "unknown" | "blocked";

const dateFormat = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta",
});
const confirmClass = "inline-flex min-h-11 items-center justify-center rounded-md border border-ws-danger bg-ws-danger px-4 text-sm font-medium text-white transition-colors duration-150 hover:bg-ws-danger/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ws-danger disabled:cursor-wait disabled:opacity-60 motion-reduce:transition-none";

export function DeactivationRequestActions({ request, actorId, canDecide, canCancel }: {
  request: RequestSummary;
  actorId: string;
  canDecide: boolean;
  canCancel: boolean;
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const backButton = useRef<HTMLButtonElement>(null);
  const inFlight = useRef(false);
  const [action, setAction] = useState<DeactivationAction | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>("editing");
  const [error, setError] = useState("");
  const [expired, setExpired] = useState(false);
  const locked = outcome !== "editing";
  const prefix = `deactivation-action-${request.id}`;

  useEffect(() => {
    if (!open) return;
    const element = dialog.current!;
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element.showModal();
    document.body.style.overflow = "hidden";
    backButton.current?.focus();
    return () => {
      element.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [open]);

  function begin(next: DeactivationAction) {
    if (inFlight.current || locked) return;
    setAction(next);
    setError("");
    setExpired(false);
    setOpen(true);
  }

  function close() {
    if (inFlight.current) return;
    setOpen(false);
    if (outcome === "success") router.refresh();
  }

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!action || locked || inFlight.current) return;
    if ((action === "CANCEL" && !canCancel) || (action !== "CANCEL" && !canDecide)) return;

    inFlight.current = true;
    setPending(true);
    setError("");
    const mutation = deactivationMutation(action);
    try {
      const response = await fetch(`/api/item-deactivation-requests/${encodeURIComponent(request.id)}/${mutation.segment}`, {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mutation.body),
      });
      const body: unknown = await response.json().catch(() => null);
      if (response.status === 200) {
        if (!confirmedDeactivationAction(body, { requestId: request.id, itemId: request.itemId, actorId, action })) {
          throw new Error("Unconfirmed decision");
        }
        setOutcome("success");
        return;
      }
      if ([400, 401, 403, 404, 409, 413, 415].includes(response.status)) {
        setOutcome("blocked");
        setExpired(response.status === 401);
        setError(
          response.status === 401 ? "Sesi Anda berakhir. Masuk kembali untuk melanjutkan."
            : response.status === 403 ? "Anda tidak memiliki izin untuk tindakan ini."
              : response.status === 404 ? "Pengajuan atau jenis barang tidak ditemukan. Muat ulang daftar."
                : response.status === 409 ? "Data sudah berubah atau pengajuan sudah diproses. Muat ulang daftar untuk melihat hasil terbaru."
                  : "Tindakan tidak dapat diproses. Muat ulang daftar sebelum mencoba kembali.",
        );
        return;
      }
      throw new Error("Unconfirmed decision");
    } catch {
      setOutcome("unknown");
      setError("Hasil tindakan belum dapat dipastikan. Jangan kirim ulang; muat ulang daftar untuk memeriksa status terbaru.");
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  if (!canDecide && !canCancel) return null;

  return (
    <>
      <div className="mt-3 flex flex-wrap gap-2">
        {locked ? (
          <button type="button" onClick={() => setOpen(true)} className="ws-button-secondary">{outcome === "success" ? "Lihat hasil" : "Periksa hasil"}</button>
        ) : (
          <>
            {canDecide ? (
              <>
                <button type="button" aria-label={`Setujui pengajuan ${request.itemName}`} aria-haspopup="dialog" onClick={() => begin("APPROVE")} className="ws-button-secondary">{deactivationActions.APPROVE.label}</button>
                <button type="button" aria-label={`Tolak pengajuan ${request.itemName}`} aria-haspopup="dialog" onClick={() => begin("REJECT")} className="ws-button-secondary">{deactivationActions.REJECT.label}</button>
              </>
            ) : null}
            {canCancel ? <button type="button" aria-label={`Batalkan pengajuan ${request.itemName}`} aria-haspopup="dialog" onClick={() => begin("CANCEL")} className="ws-button-secondary">{deactivationActions.CANCEL.label}</button> : null}
          </>
        )}
      </div>

      {open && action ? createPortal(
        <dialog
          ref={dialog} aria-labelledby={`${prefix}-heading`}
          onClick={event => event.stopPropagation()}
          onKeyDown={event => { if (event.key === "Escape") event.stopPropagation(); }}
          onCancel={event => { event.stopPropagation(); event.preventDefault(); close(); }}
          className="fixed inset-0 m-auto max-h-[calc(100svh-24px)] w-[calc(100%-24px)] max-w-lg overflow-y-auto overscroll-contain rounded-lg border-0 bg-ws-surface p-5 font-workspace text-ws-text shadow-xl backdrop:bg-black/35 [color-scheme:light] sm:p-6"
        >
          <header>
            <div className="flex items-center justify-between gap-4 border-b border-ws-divider pb-4">
              <h2 id={`${prefix}-heading`} className="text-sm font-medium text-ws-strong">{deactivationActions[action].heading}</h2>
              <button type="button" aria-label="Tutup konfirmasi pengajuan" disabled={pending} onClick={close} className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-ws-strong hover:bg-ws-inset focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ws-primary disabled:cursor-wait disabled:opacity-60">
                <WorkspaceControlIcon name="close" />
              </button>
            </div>
            <div className="pt-4"><ItemNameDisclosure id={`${prefix}-item`} name={request.itemName} /></div>
          </header>

          {outcome === "success" ? (
            <div className="mt-5">
              <p role="status" className="text-sm leading-6 text-ws-success">{deactivationActions[action].success}</p>
              <div className="mt-6 flex justify-end"><button type="button" onClick={close} className="ws-button-secondary">Selesai</button></div>
            </div>
          ) : (
            <form onSubmit={submit} aria-busy={pending} className="mt-5">
              <dl className="space-y-4 text-sm leading-6">
                <div><dt className="text-xs">Pengaju</dt><dd className="text-ws-strong [overflow-wrap:anywhere]">{request.requestedBy}</dd></div>
                <div><dt className="text-xs">Diajukan</dt><dd><time dateTime={request.createdAt}>{dateFormat.format(new Date(request.createdAt))} WIB</time></dd></div>
                <div><dt className="text-xs">Alasan pengajuan</dt><dd className="whitespace-pre-wrap text-ws-strong [overflow-wrap:anywhere]">{request.reason}</dd></div>
              </dl>
              <p className="mt-5 border-t border-ws-divider pt-4 text-sm leading-6">{deactivationActions[action].effect}</p>
              {error ? <p role="alert" className="mt-4 text-sm leading-6 text-ws-danger">{error}</p> : null}
              {expired ? <a href="/login" className="ws-button-secondary mt-3">Ke halaman masuk</a> : null}
              <div className="mt-6 flex flex-wrap justify-end gap-3">
                <button ref={backButton} type="button" disabled={pending} onClick={close} className="ws-button-secondary">{locked ? "Tutup" : "Kembali"}</button>
                {locked ? (
                  <button type="button" onClick={() => window.location.reload()} className="ws-button-secondary">Muat ulang daftar</button>
                ) : (
                  <button type="submit" disabled={pending} className={confirmClass}>{pending ? "Memproses…" : deactivationActions[action].confirm}</button>
                )}
              </div>
            </form>
          )}
        </dialog>, document.body,
      ) : null}
    </>
  );
}
