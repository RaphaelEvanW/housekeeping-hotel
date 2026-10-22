"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode, type SubmitEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { WorkspaceControlIcon } from "@/components/workspace-control-icon";

type Item = { id: string; name: string };
type Unit = { serialNumber: string; notes: string; condition: string };
type Attempt = { requestId: string; itemId: string; initialLocationId: string; quantity: number; units: Unit[] };
const StockContext = createContext<((item: Item) => void) | null>(null);
const conditions = { GOOD: "Baik", MINOR_DAMAGE: "Rusak ringan", DAMAGED: "Rusak", MISSING_PART: "Komponen tidak lengkap" };
const inputClass = "mt-2 min-h-11 w-full min-w-0 rounded-md border border-ws-control bg-ws-inset px-3 text-sm text-ws-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ws-primary disabled:opacity-60";
const actionClass = "inline-flex min-h-11 items-center justify-center rounded-md bg-ws-primary px-4 text-sm leading-5 font-medium tracking-[0.01em] text-white hover:bg-ws-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ws-primary disabled:cursor-wait disabled:opacity-60";

export function AddStockButton({ item, labelled = false }: { item: Item; labelled?: boolean }) {
  const open = useContext(StockContext);
  if (!open) throw new Error("AddStockButton requires StockRegistrationProvider");
  return <button type="button" onClick={() => open(item)} aria-label={`Tambah stok ${item.name}`} title="Tambah stok" aria-haspopup="dialog" className={`${actionClass} shrink-0 ${labelled ? "w-full gap-2" : "w-11 px-0"}`}><WorkspaceControlIcon name="plus" />{labelled ? <span>Tambah stok</span> : null}</button>;
}

export function StockRegistrationProvider({ children, enabled, locations }: { children: ReactNode; enabled: boolean; locations: { id: string; name: string }[] }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const overflow = useRef("");
  const inFlight = useRef(false);
  const attempt = useRef<Attempt | null>(null);
  const [item, setItem] = useState<Item | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [openUnit, setOpenUnit] = useState<number | null>(0);
  const [pending, setPending] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState("");
  const [expired, setExpired] = useState(false);
  const [success, setSuccess] = useState(0);

  useEffect(() => {
    if (!uncertain) return;
    const warnBeforeReload = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warnBeforeReload);
    return () => window.removeEventListener("beforeunload", warnBeforeReload);
  }, [uncertain]);

  useEffect(() => {
    const element = dialog.current;
    return () => { if (element?.open) { element.close(); document.body.style.overflow = overflow.current; } };
  }, []);

  function open(selected: Item) {
    // shortcut: pending batch is page-local; reload recovery needs per-account persistence.
    if (!attempt.current) {
      setItem(selected); setQuantity("1"); setOpenUnit(0); setError(""); setExpired(false); setSuccess(0); setUncertain(false);
      form.current?.reset();
    }
    overflow.current = document.body.style.overflow;
    dialog.current?.showModal();
    document.body.style.overflow = "hidden";
    input.current?.focus();
  }

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || !item) return;
    if (!attempt.current) {
      const values = new FormData(event.currentTarget);
      const count = Number(quantity);
      if (!Number.isInteger(count) || count < 1 || count > 100) { setError("Jumlah unit harus 1–100."); return; }
      const initialLocationId = String(values.get("initialLocationId") ?? "");
      if (!locations.some(location => location.id === initialLocationId)) { setError("Pilih lokasi awal yang aktif."); return; }
      const units = Array.from({ length: count }, (_, index) => ({
        serialNumber: String(values.get(`serial-${index}`) ?? "").trim(),
        notes: String(values.get(`notes-${index}`) ?? "").trim(),
        condition: String(values.get(`condition-${index}`) || "GOOD"),
      }));
      const payload = { requestId: crypto.randomUUID(), itemId: item.id, initialLocationId, quantity: count, units };
      if (new TextEncoder().encode(JSON.stringify(payload)).byteLength > 256 * 1024) { setError("Data terlalu besar. Ringkas nomor seri atau deskripsi unit."); return; }
      attempt.current = payload;
    }
    const payload = attempt.current;
    inFlight.current = true; setPending(true); setError(""); setExpired(false);
    try {
      const response = await fetch("/api/stock-batches", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body: unknown = await response.json().catch(() => null);
      if (response.status === 200 || response.status === 201) {
        if (!body || typeof body !== "object" || !("batch" in body) || !body.batch || typeof body.batch !== "object" || !("id" in body.batch) || body.batch.id !== payload.requestId || !("quantity" in body.batch) || body.batch.quantity !== payload.quantity || !("itemId" in body.batch) || body.batch.itemId !== payload.itemId) throw new Error("Unconfirmed batch");
        attempt.current = null; setUncertain(false); setSuccess(payload.quantity); router.refresh();
      } else if (response.status >= 400 && response.status < 500) {
        const code = body && typeof body === "object" && "error" in body ? body.error : null;
        if (code === "REQUEST_CONFLICT") {
          setUncertain(true);
          setError("ID penambahan stok berbenturan. Jangan buat batch baru; hubungi pengelola untuk memeriksa hasilnya.");
        } else if ([400, 401, 403, 404, 413, 415].includes(response.status) || code === "ITEM_INACTIVE" || code === "STORAGE_UNAVAILABLE" || code === "LOCATION_UNAVAILABLE") {
          attempt.current = null; setUncertain(false); setExpired(response.status === 401);
          setError(response.status === 401 ? "Sesi Anda berakhir. Masuk kembali untuk melanjutkan."
            : response.status === 403 ? "Anda tidak memiliki izin menambah stok."
              : response.status === 404 ? "Jenis barang tidak ditemukan."
                : code === "ITEM_INACTIVE" ? "Jenis barang sudah nonaktif. Stok tidak dapat ditambahkan."
                  : code === "STORAGE_UNAVAILABLE" || code === "LOCATION_UNAVAILABLE" ? "Lokasi awal tidak tersedia atau sudah nonaktif. Muat ulang daftar lokasi sebelum mencoba kembali."
                    : "Periksa jumlah dan detail unit sebelum menyimpan kembali.");
        } else throw new Error("Unconfirmed rejection");
      } else throw new Error("Unconfirmed save");
    } catch {
      setUncertain(true);
      setError("Hasil penyimpanan belum dapat dipastikan. Periksa ulang dengan tombol di bawah; ID batch tetap sama. Jangan muat ulang atau meninggalkan halaman sebelum hasilnya terkonfirmasi.");
    } finally { inFlight.current = false; setPending(false); }
  }

  const count = Math.min(100, Math.max(0, Number(quantity) || 0));
  const locked = pending || uncertain;
  if (!enabled) return <>{children}</>;
  return <StockContext.Provider value={open}>
    {children}
    <dialog ref={dialog} aria-labelledby="add-stock-heading" aria-describedby="add-stock-item" onKeyDown={event => { if (event.key === "Escape") event.stopPropagation(); }} onCancel={event => { if (inFlight.current) event.preventDefault(); }} onClose={() => { document.body.style.overflow = overflow.current; }} className="fixed inset-0 m-auto max-h-[calc(100svh-32px)] w-[calc(100%-32px)] max-w-xl overflow-y-auto overscroll-contain rounded-lg border-0 bg-ws-surface p-6 font-workspace text-ws-text shadow-xl backdrop:bg-black/35 [color-scheme:light] sm:p-8">
      <h2 id="add-stock-heading" className="font-heading text-xl leading-7 font-semibold text-ws-strong">Tambah stok</h2>
      <p id="add-stock-item" className="mt-2 break-words text-sm leading-6">{item?.name}</p>
      {success ? <div className="mt-6"><p role="status" className="text-sm text-ws-success">{success} unit berhasil ditambahkan.</p><button type="button" onClick={() => dialog.current?.close()} className={`${actionClass} mt-6`}>Selesai</button></div> : <form ref={form} onSubmit={submit} aria-busy={pending} className="mt-5">
        <p className="mb-4 text-xs">* Wajib diisi</p>
        <label htmlFor="stock-quantity" className="block text-sm font-medium text-ws-strong">Jumlah unit <span aria-hidden="true">*</span></label>
        <input ref={input} id="stock-quantity" name="quantity" type="number" min={1} max={100} step={1} required value={quantity} onChange={event => { setQuantity(event.target.value); setOpenUnit(null); }} disabled={locked} className={`${inputClass} [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`} />
        <p className="mt-2 text-xs leading-5">1-100 unit per penambahan</p>
        <label htmlFor="stock-location" className="mt-5 block text-sm font-medium text-ws-strong">Lokasi awal <span aria-hidden="true">*</span></label>
        <select id="stock-location" name="initialLocationId" defaultValue="" required disabled={locked || locations.length === 0} className={inputClass}><option value="" disabled>Pilih lokasi awal</option>{locations.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}</select>
        {locations.length === 0 ? <p role="alert" className="mt-2 text-sm leading-6 text-ws-danger">Belum ada lokasi aktif. Hubungi pengelola untuk menyiapkan lokasi.</p> : null}
        <div className="mt-5 space-y-4">
          {Array.from({ length: count }, (_, index) => <details key={index} name="stock-units" open={openUnit === index} onToggle={event => { const expanded = event.currentTarget.open; setOpenUnit(current => expanded ? index : current === index ? null : current); }} className="group min-w-0 border-y border-ws-divider">
            <summary id={`stock-unit-heading-${index}`} className="flex min-h-11 items-center justify-between gap-3 px-3 py-3 text-sm font-medium text-ws-strong hover:bg-ws-inset focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ws-primary"><span>Unit {index + 1}</span><span className="text-xs text-ws-primary group-open:hidden">Buka</span><span className="hidden text-xs text-ws-primary group-open:inline">Tutup</span></summary>
            <fieldset aria-labelledby={`stock-unit-heading-${index}`} disabled={locked} className="min-w-0 border-0 px-3 pt-1 pb-4">
            <label htmlFor={`stock-unit-condition-${index}`} className="mt-2 block text-sm font-medium text-ws-strong">Kondisi unit <span aria-hidden="true">*</span></label><select id={`stock-unit-condition-${index}`} name={`condition-${index}`} defaultValue="GOOD" required className={inputClass}>{Object.entries(conditions).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            <label htmlFor={`stock-serial-${index}`} className="mt-4 block text-sm font-medium text-ws-strong">Nomor seri <span className="font-normal text-ws-text">(opsional)</span></label><input id={`stock-serial-${index}`} name={`serial-${index}`} className={inputClass} />
            <label htmlFor={`stock-notes-${index}`} className="mt-4 block text-sm font-medium text-ws-strong">Deskripsi <span className="font-normal text-ws-text">(opsional)</span></label><textarea id={`stock-notes-${index}`} name={`notes-${index}`} rows={2} className={`${inputClass} resize-none py-3`} />
            </fieldset>
          </details>)}
        </div>
        <p role="alert" className={error ? "mt-4 text-sm leading-6 text-ws-danger" : "sr-only"}>{error}</p>
        {expired ? <Link href="/login" className="mt-2 inline-flex min-h-11 items-center text-sm text-ws-primary underline">Ke halaman masuk</Link> : null}
        <div className="mt-6 flex flex-wrap justify-end gap-3"><button type="button" disabled={pending} onClick={() => dialog.current?.close()} className="min-h-11 rounded-md bg-ws-inset px-4 text-sm font-medium text-ws-strong focus-visible:outline-2 focus-visible:outline-ws-primary disabled:opacity-60">{uncertain ? "Tutup" : "Batal"}</button><button type="submit" disabled={pending || (locations.length === 0 && !uncertain)} className={actionClass}>{pending ? "Menyimpan…" : uncertain ? "Periksa ulang penyimpanan" : "Simpan stok"}</button></div>
      </form>}
    </dialog>
  </StockContext.Provider>;
}
