"use client";

import { useEffect, useRef, useState, type SubmitEvent } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { WorkspaceControlIcon } from "@/components/workspace-control-icon";
import { confirmedGuestCheckout } from "@/lib/guest-checkout";

const primaryClass = "inline-flex min-h-11 items-center justify-center rounded-md border border-ws-primary bg-ws-primary px-4 text-sm font-medium text-white transition-colors hover:border-ws-primary-hover hover:bg-ws-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ws-primary disabled:cursor-not-allowed disabled:opacity-60";
const failureSchema = z.object({ error: z.string(), message: z.string().optional() });
const warningSchema = z.object({ error: z.literal("OUTSTANDING_BORROWINGS"), outstandingLines: z.number().int().nonnegative() });

export function CheckoutGuestDialog({ visit, outstandingLines }: {
  visit: { id: string; primaryGuestName: string; roomNumber: string };
  outstandingLines: number;
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const submitting = useRef(false);
  const attempt = useRef<{ acknowledgeOutstanding: boolean } | null>(null);
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(outstandingLines);
  const [acknowledged, setAcknowledged] = useState(false);
  const [pending, setPending] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [expired, setExpired] = useState(false);
  const [error, setError] = useState("");
  const [completed, setCompleted] = useState(false);
  const locked = pending || uncertain;

  useEffect(() => {
    if (!open) return;
    const element = dialog.current!;
    const previousOverflow = document.body.style.overflow;
    const focus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      element.close();
      document.body.style.overflow = previousOverflow;
      if (focus?.isConnected) focus.focus({ preventScroll: true });
    };
  }, [open]);

  useEffect(() => {
    if (!locked) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [locked]);

  function show() {
    attempt.current = null;
    setCount(outstandingLines);
    setAcknowledged(false);
    setError("");
    setUncertain(false);
    setExpired(false);
    setOpen(true);
  }

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    if (!attempt.current) {
      if (count > 0 && !acknowledged) { setError("Konfirmasi pinjaman yang belum kembali sebelum melanjutkan checkout."); return; }
      attempt.current = { acknowledgeOutstanding: acknowledged };
    }
    const current = attempt.current;
    submitting.current = true;
    setPending(true);
    setError("");
    setExpired(false);
    try {
      const response = await fetch(`/api/guest-visits/${visit.id}/checkout`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(current) });
      const body: unknown = await response.json().catch(() => null);
      if (response.status === 200) {
        if (!confirmedGuestCheckout(body, visit.id)) throw new Error("Unconfirmed checkout");
        attempt.current = null;
        setUncertain(false);
        setCompleted(true);
        setOpen(false);
        router.refresh();
        return;
      }
      const failure = failureSchema.safeParse(body);
      if (!failure.success || response.status >= 500) throw new Error("Unconfirmed checkout save");
      if (response.status === 409 && failure.data.error === "OUTSTANDING_BORROWINGS") {
        const warning = warningSchema.safeParse(body);
        if (!warning.success) throw new Error("Unconfirmed checkout warning");
        attempt.current = null;
        setUncertain(false);
        setCount(warning.data.outstandingLines);
        setAcknowledged(false);
        setError("Daftar pinjaman sudah berubah. Tinjau jumlah unit dan konfirmasi kembali.");
        return;
      }
      if (response.status >= 400 && response.status < 500 && (["INVALID_INPUT", "VISIT_NOT_FOUND", "PAYLOAD_TOO_LARGE"].includes(failure.data.error) || response.status === 401 || response.status === 403)) {
        if (!uncertain || failure.data.error === "VISIT_NOT_FOUND") { attempt.current = null; setUncertain(false); }
        setExpired(response.status === 401);
        setError(response.status === 401 ? "Sesi Anda berakhir. Masuk kembali untuk melanjutkan." : response.status === 403 ? "Anda tidak memiliki izin melakukan checkout." : failure.data.message ?? "Checkout belum dapat disimpan.");
        return;
      }
      throw new Error("Unconfirmed checkout rejection");
    } catch {
      setUncertain(true);
      setError("Hasil checkout belum dapat dipastikan. Jangan tutup halaman. Periksa penyimpanan kembali.");
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  return <div>
    {completed ? <p role="status" className="py-3 text-sm text-ws-success">Checkout berhasil dicatat.</p> : <button type="button" className="ws-button-secondary" onClick={show}><WorkspaceControlIcon name="logout" />Checkout</button>}
    {open ? <dialog ref={dialog} aria-labelledby="checkout-guest-heading" className="fixed inset-0 m-auto max-h-[calc(100svh-2rem)] w-[calc(100%-2rem)] max-w-[480px] flex-col overflow-hidden rounded-lg bg-ws-surface p-0 text-ws-text backdrop:bg-black/40 open:flex" onCancel={event => { event.preventDefault(); if (!locked) setOpen(false); }}>
      <form noValidate onSubmit={submit} className="flex min-h-0 flex-col">
        <header className="shrink-0 px-5 pt-4 sm:px-7"><div className="flex items-center justify-between gap-3"><h2 id="checkout-guest-heading" className="text-sm">Checkout tamu</h2><button type="button" aria-label="Tutup checkout" disabled={locked} onClick={() => setOpen(false)} className="ws-button-secondary size-11 shrink-0 border-transparent bg-transparent p-0"><WorkspaceControlIcon name="close" /></button></div><div className="mt-3 border-t border-ws-divider pt-4"><p className="break-words text-lg font-semibold text-ws-strong">{visit.primaryGuestName}</p><p className="mt-1 text-sm">Kamar {visit.roomNumber}</p></div></header>
        <div className="min-h-0 space-y-4 overflow-y-auto overscroll-contain px-5 py-5 sm:px-7">
          <p className="text-sm leading-6">Catat bahwa masa menginap tamu sudah berakhir. Tamu tidak dapat menerima pinjaman baru untuk kunjungan ini.</p>
          {count > 0 ? <div className="rounded-md border border-ws-warning/30 bg-ws-warning/5 p-4"><p className="text-sm font-medium text-ws-strong">{count} unit belum dikembalikan</p><p className="mt-1 text-sm leading-6">Pinjaman tetap aktif dan pengembaliannya masih dapat diterima setelah checkout.</p><label className="mt-3 flex min-h-11 cursor-pointer items-start gap-3 text-sm leading-6"><input type="checkbox" checked={acknowledged} disabled={locked} onChange={event => { setAcknowledged(event.target.checked); setError(""); }} className="mt-1 size-4 shrink-0 accent-ws-primary" /><span>Saya sudah meninjau pinjaman yang belum kembali dan tetap melanjutkan checkout.</span></label></div> : <p className="text-sm text-ws-success">Tidak ada unit yang masih dipinjam.</p>}
          {error ? <p role="alert" className="text-sm leading-6 text-ws-danger">{error}</p> : null}
          {expired ? <a href="/login" target={uncertain ? "_blank" : undefined} rel="noopener noreferrer" className="ws-button-secondary">Masuk kembali{uncertain ? " (tab baru)" : ""}</a> : null}
        </div>
        <footer className="flex shrink-0 flex-wrap justify-end gap-3 border-t border-ws-divider px-5 py-4 sm:px-7"><button type="button" disabled={locked} className="ws-button-secondary" onClick={() => setOpen(false)}>Batal</button><button type="submit" disabled={pending} className={primaryClass}>{pending ? "Menyimpan…" : uncertain ? "Periksa penyimpanan" : "Konfirmasi checkout"}</button></footer>
      </form>
    </dialog> : null}
  </div>;
}
