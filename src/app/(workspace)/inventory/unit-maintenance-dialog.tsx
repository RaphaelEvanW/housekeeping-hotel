"use client";

import { useEffect, useRef, useState, type SubmitEvent } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { z } from "zod";

import { FieldError } from "@/components/field-error";
import { WorkspaceControlIcon } from "@/components/workspace-control-icon";
import { conditionLabels } from "@/lib/unit-state-labels";
import {
  confirmedUnitReceipt,
  parseUnitMaintenance,
  type UnitMaintenancePair,
  type UnitReceiptPayload,
} from "@/lib/unit-maintenance-view";
import { prepareUnitPhotoUpload } from "@/lib/stock-upload";
import { useInventoryForm } from "@/lib/use-inventory-form";
import { receiveMaintainedUnitInputSchema } from "@/server/unit-maintenance-input";
import type { UnitCondition } from "@/generated/prisma/enums";
import { UnitHistoryPhoto } from "./unit-history-photo";
import { UnitPhotoField } from "./unit-photo-field";

type Phase = "edit" | "retry" | "reload" | "saved";
type Unit = {
  id: string;
  displayName: string;
  unitCode: string;
  itemName: string;
  condition: UnitCondition;
  updatedAt: string;
};
type Attempt = {
  payload: UnitReceiptPayload;
  photos: File[];
  upload?: Awaited<ReturnType<typeof prepareUnitPhotoUpload>>;
};
type ReadResult =
  | { pair: UnitMaintenancePair }
  | { error: string; expired: boolean };

const failureSchema = z.object({ error: z.string() });
const conditionSchema = z.enum([
  "GOOD",
  "MINOR_DAMAGE",
  "DAMAGED",
  "MISSING_PART",
]);
const inputClass =
  "mt-2 min-h-11 w-full min-w-0 rounded-md border border-ws-control bg-ws-inset px-3 text-sm text-ws-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ws-primary disabled:cursor-not-allowed disabled:opacity-60";
const primaryClass =
  "inline-flex min-h-11 items-center justify-center rounded-md border border-ws-primary bg-ws-primary px-4 text-sm font-medium text-white transition-colors hover:border-ws-primary-hover hover:bg-ws-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ws-primary disabled:cursor-not-allowed disabled:opacity-60";
const dateFormat = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Jakarta",
});
const timeZoneOffset = 7 * 60 * 60 * 1000;

function localTime(value: string) {
  if (!value) return "";
  const withSeconds = value.length === 16 ? `${value}:00` : value;
  const date = new Date(`${withSeconds}+07:00`);
  return Number.isFinite(date.getTime()) ? date.toISOString() : "";
}

function initialLocalTime() {
  return new Date(Date.now() + timeZoneOffset).toISOString().slice(0, 16);
}

function readError(status: number) {
  if (status === 401) return "Sesi berakhir. Masuk kembali untuk melihat bukti.";
  if (status === 403) return "Akun Anda tidak memiliki izin melihat bukti perbaikan.";
  if (status === 404) return "Catatan penyerahan tidak ditemukan. Muat ulang riwayat unit.";
  return "Bukti perbaikan belum berhasil dimuat. Coba lagi.";
}

const stateErrors: Record<string, string> = {
  HANDOVER_NOT_FOUND: "Catatan penyerahan tidak ditemukan. Muat ulang riwayat unit.",
  ALREADY_RECEIVED: "Unit pada penyerahan ini sudah diterima kembali.",
  UNIT_NOT_FOUND: "Unit tidak lagi tersedia. Muat ulang data.",
  UNIT_STATE_CONFLICT: "Data unit sudah berubah. Muat ulang sebelum melanjutkan.",
  STALE_UNIT: "Data unit sudah berubah. Muat ulang sebelum melanjutkan.",
  OUTSTANDING_BORROWING: "Unit tercatat masih dipinjam. Muat ulang data unit.",
  LOCATION_UNAVAILABLE: "Lokasi tidak lagi tersedia. Muat ulang daftar lokasi.",
};

export function UnitMaintenanceDialog({
  handoverId,
  unit,
  canReceive,
  locations,
  onDone,
}: {
  handoverId: string;
  unit: Unit;
  canReceive: boolean;
  locations: { id: string; name: string }[];
  onDone: () => void;
}) {
  const router = useRouter();
  const validation = useInventoryForm();
  const dialog = useRef<HTMLDialogElement>(null);
  const successClose = useRef<HTMLButtonElement>(null);
  const attempt = useRef<Attempt | null>(null);
  const inFlight = useRef(false);
  const [open, setOpen] = useState(false);
  const [revision, setRevision] = useState(0);
  const [read, setRead] = useState<ReadResult | null>(null);
  const [phase, setPhase] = useState<Phase>("edit");
  const [pending, setPending] = useState(false);
  const [expired, setExpired] = useState(false);
  const [error, setError] = useState("");
  const [condition, setCondition] = useState<UnitCondition>(unit.condition);
  const [initialTime, setInitialTime] = useState("");
  const pair = read && "pair" in read ? read.pair : null;
  const readFailure = read && "error" in read ? read : null;
  const workRequired = condition !== unit.condition;
  const locked = pending || phase !== "edit";
  const showForm = Boolean(pair && !pair.after && canReceive && phase !== "reload");
  const headingId = `unit-maintenance-${handoverId}`;

  useEffect(() => {
    if (!open) return;
    const element = dialog.current;
    if (!element) return;
    const previousOverflow = document.body.style.overflow;
    const ownsScrollLock = previousOverflow !== "hidden";
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    element.showModal();
    if (ownsScrollLock) document.body.style.overflow = "hidden";

    return () => {
      element.close();
      if (ownsScrollLock) document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(
          `/api/unit-maintenance/${encodeURIComponent(handoverId)}`,
          { cache: "no-store", credentials: "same-origin", signal: controller.signal },
        );
        if (!response.ok) {
          if (!controller.signal.aborted) {
            setRead({ error: readError(response.status), expired: response.status === 401 });
          }
          return;
        }
        const parsed = parseUnitMaintenance(await response.json(), handoverId, unit.id);
        if (!parsed) throw new Error("Invalid maintenance history response");
        if (!controller.signal.aborted) setRead({ pair: parsed });
      } catch {
        if (!controller.signal.aborted) {
          setRead({ error: "Bukti perbaikan belum berhasil dimuat. Coba lagi.", expired: false });
        }
      }
    })();
    return () => controller.abort();
  }, [handoverId, open, revision, unit.id]);

  useEffect(() => {
    if (phase === "saved") successClose.current?.focus({ preventScroll: true });
  }, [phase]);

  useEffect(() => {
    if (!pending && phase !== "retry") return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [pending, phase]);

  function show() {
    if (phase !== "retry" && phase !== "reload") {
      attempt.current = null;
      validation.reset();
      setPhase("edit");
      setCondition(unit.condition);
      setInitialTime(initialLocalTime());
      setExpired(false);
      setError("");
    }
    setRead(null);
    setOpen(true);
  }

  function close() {
    if (inFlight.current || phase === "retry") return;
    setOpen(false);
    if (phase === "saved") onDone();
  }

  async function send(current: Attempt) {
    if (inFlight.current) return;
    const recovering = phase === "retry";
    inFlight.current = true;
    setPending(true);
    setExpired(false);
    setError("");
    try {
      try {
        current.upload ??= await prepareUnitPhotoUpload(current.payload, [current.photos]);
      } catch (failure) {
        if (!recovering) attempt.current = null;
        setError(failure instanceof Error ? failure.message : "Foto belum dapat disiapkan.");
        return;
      }

      const response = await fetch("/api/unit-maintenance/receive", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": current.upload.contentType },
        body: current.upload.body,
      });
      const body: unknown = await response.json().catch(() => null);

      if (response.status === 200 || response.status === 201) {
        if (!confirmedUnitReceipt(body, current.payload, unit.id, current.photos.length)) {
          throw new Error("Unconfirmed unit receipt response");
        }
        attempt.current = null;
        setPhase("saved");
        router.refresh();
        return;
      }

      const failure = failureSchema.safeParse(body);
      if (!failure.success || response.status >= 500) throw new Error("Unconfirmed receipt response");
      const code = failure.data.error;
      if (code === "REQUEST_CONFLICT") {
        setPhase("reload");
        setError("Permintaan ini sudah dipakai untuk tindakan lain. Muat ulang dan periksa riwayat unit.");
        return;
      }
      if (code === "RETRY_REQUIRED") {
        setPhase("retry");
        setError("Penyimpanan belum dapat dipastikan. Periksa lagi dengan data dan foto yang sama.");
        return;
      }
      if (stateErrors[code]) {
        attempt.current = null;
        setPhase("reload");
        setError(stateErrors[code]);
        return;
      }
      if ([400, 401, 403, 413, 415].includes(response.status)) {
        if (!recovering) attempt.current = null;
        setPhase(recovering ? "retry" : "edit");
        setExpired(response.status === 401);
        setError(
          response.status === 401
            ? "Sesi berakhir. Masuk kembali sebelum menyimpan penerimaan."
            : response.status === 403
              ? "Akun Anda tidak memiliki izin menerima unit."
              : response.status === 413
                ? "Total unggahan maksimal 16 MiB. Kurangi ukuran atau jumlah foto."
                : code === "INVALID_PHOTO"
                  ? "Foto tidak dapat diproses. Gunakan JPEG, PNG, atau WebP statis maksimal 2 MiB per foto."
                  : code === "PHOTOS_REQUIRED"
                    ? "Lampirkan minimal satu foto kondisi unit saat diterima."
                    : "Periksa kondisi, waktu, lokasi, pekerjaan, dan foto penerimaan.",
        );
        return;
      }
      throw new Error("Unconfirmed unit receipt rejection");
    } catch {
      setPhase("retry");
      setError("Hasil penyimpanan belum dapat dipastikan. Periksa lagi dengan data dan foto yang sama, atau muat ulang untuk melihat riwayat unit.");
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || phase === "reload" || phase === "saved") return;
    if (phase === "retry") {
      if (attempt.current) await send(attempt.current);
      return;
    }
    if (!pair || !canReceive || !validation.validate(event.currentTarget)) return;

    const values = new FormData(event.currentTarget);
    const occurredAt = localTime(String(values.get("occurredAt") ?? ""));
    const workCompletedAt = localTime(String(values.get("workCompletedAt") ?? "")) || null;
    const handoverAt = Date.parse(pair.before.after.occurredAt);
    const receivedAt = Date.parse(occurredAt);
    const completedAt = workCompletedAt ? Date.parse(workCompletedAt) : null;
    if (
      !occurredAt || receivedAt > Date.now() || receivedAt < handoverAt ||
      (completedAt !== null && (completedAt < handoverAt || completedAt > receivedAt))
    ) {
      setError("Periksa waktu penerimaan dan penyelesaian pekerjaan.");
      return;
    }

    const parsed = receiveMaintainedUnitInputSchema.safeParse({
      requestId: crypto.randomUUID(),
      handoverId,
      expectedUpdatedAt: unit.updatedAt,
      occurredAt,
      locationId: String(values.get("locationId") ?? ""),
      condition: String(values.get("condition") ?? ""),
      receivedFrom: String(values.get("receivedFrom") ?? ""),
      workPerformed: String(values.get("workPerformed") ?? ""),
      performedBy: String(values.get("performedBy") ?? "").trim() || null,
      workCompletedAt,
    });
    if (!parsed.success) {
      setError("Periksa petugas, lokasi, waktu penerimaan, dan catatan pekerjaan.");
      return;
    }
    const current: Attempt = {
      payload: parsed.data,
      photos: values.getAll("photo-0").filter(
        (value): value is File => value instanceof File && value.size > 0,
      ),
    };
    attempt.current = current;
    await send(current);
  }

  function retryRead() {
    setRead(null);
    setRevision((value) => value + 1);
  }

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={show}
        className="mt-2 inline-flex min-h-11 items-center gap-2 rounded text-xs font-medium text-ws-strong underline decoration-ws-sidebar/25 underline-offset-4 hover:decoration-ws-sidebar focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ws-primary"
      >
        {canReceive ? "Terima dari Engineering" : "Detail perbaikan"}
        <span className="[&>svg]:size-4"><WorkspaceControlIcon name="caretRight" /></span>
      </button>
      {open ? createPortal(
        <dialog
          ref={dialog}
          aria-labelledby={headingId}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => { if (event.key === "Escape") event.stopPropagation(); }}
          onCancel={(event) => { event.preventDefault(); event.stopPropagation(); close(); }}
          className={`fixed inset-0 m-auto w-[calc(100%-24px)] flex-col overflow-clip rounded-lg border-0 bg-ws-surface p-0 font-workspace text-ws-text shadow-xl backdrop:bg-black/40 open:flex [color-scheme:light] ${phase === "saved" ? "max-h-[calc(100svh-24px)] max-w-sm" : "h-[min(760px,calc(100svh-24px))] max-h-[calc(100svh-24px)] max-w-[640px]"}`}
        >
          {phase === "saved" ? (
            <div className="flex items-center justify-between gap-4 p-4">
              <h2 id={headingId} className="sr-only">Penerimaan unit tersimpan</h2>
              <p role="status" className="text-sm text-ws-success">Penerimaan unit tersimpan.</p>
              <button ref={successClose} type="button" onClick={close} aria-label="Tutup" className="ws-button-secondary size-11 shrink-0 p-0">
                <WorkspaceControlIcon name="close" />
              </button>
            </div>
          ) : (
            <form
              noValidate
              onSubmit={submit}
              onInput={(event) => {
                validation.onInput(event);
                if (phase === "edit") { setExpired(false); setError(""); }
              }}
              aria-busy={pending}
              className="flex min-h-0 flex-1 flex-col overflow-clip"
            >
              <header className="shrink-0 border-b border-ws-divider px-5 py-4 sm:px-6">
                <div className="flex items-center justify-between gap-3">
                  <h2 id={headingId} className="text-sm font-medium text-ws-strong">Perbaikan unit</h2>
                  <button type="button" onClick={close} disabled={locked} aria-label="Tutup detail perbaikan" className="ws-button-secondary size-11 shrink-0 p-0">
                    <WorkspaceControlIcon name="close" />
                  </button>
                </div>
                <div className="mt-3 border-t border-ws-divider pt-4">
                  <p className="break-words text-lg font-semibold text-ws-strong">{unit.displayName}</p>
                  <p className="mt-1 break-words text-xs leading-5">{unit.itemName} · {unit.unitCode}</p>
                </div>
              </header>

              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-5 sm:px-6">
                {readFailure ? (
                  <div>
                    <p role="alert" className="text-sm leading-6 text-ws-danger">{readFailure.error}</p>
                    {readFailure.expired ? <a href="/login" target="_blank" rel="noopener noreferrer" className="ws-button-secondary mt-3">Masuk kembali (tab baru)</a> : null}
                    <button type="button" onClick={retryRead} className="ws-button-secondary mt-3">Muat ulang bukti</button>
                  </div>
                ) : null}
                {!read && !readFailure ? <p role="status" className="text-sm leading-6">Memuat bukti perbaikan…</p> : null}

                {pair ? (
                  <section aria-label="Bukti serah dan penerimaan" className="space-y-5">
                    {[{ label: "Saat diserahkan", event: pair.before }, ...(pair.after ? [{ label: "Saat diterima kembali", event: pair.after }] : [])].map(({ label, event }) => (
                      <article key={event.id} className="border-l border-ws-divider pl-4">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <h3 className="text-sm font-semibold text-ws-strong">{label}</h3>
                          <time dateTime={event.after.occurredAt} className="text-xs tabular-nums">{dateFormat.format(new Date(event.after.occurredAt))} WIB</time>
                        </div>
                        <p className="mt-1 text-xs">Dicatat oleh {event.recordedBy.name}</p>
                        <dl className="mt-3 grid gap-x-5 gap-y-3 sm:grid-cols-2">
                          <div>
                            <dt className="text-xs">{"handedOverTo" in event.after ? "Diserahkan kepada" : "Diterima dari"}</dt>
                            <dd className="mt-1 text-sm text-ws-strong">{"handedOverTo" in event.after ? event.after.handedOverTo : event.after.receivedFrom}</dd>
                          </div>
                          <div>
                            <dt className="text-xs">Kondisi unit</dt>
                            <dd className="mt-1 text-sm text-ws-strong">{conditionLabels[event.after.condition]}</dd>
                          </div>
                          {"performedBy" in event.after && event.after.performedBy ? <div><dt className="text-xs">Pelaksana perbaikan</dt><dd className="mt-1 text-sm text-ws-strong">{event.after.performedBy}</dd></div> : null}
                          {"workCompletedAt" in event.after && event.after.workCompletedAt ? <div><dt className="text-xs">Pekerjaan selesai</dt><dd className="mt-1 text-sm text-ws-strong">{dateFormat.format(new Date(event.after.workCompletedAt))} WIB</dd></div> : null}
                        </dl>
                        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 [overflow-wrap:anywhere]">{event.notes}</p>
                        <ul aria-label={`Foto ${label.toLocaleLowerCase("id-ID")}`} className="mt-3 flex flex-wrap gap-3">
                          {event.photos.map((photo, index) => <UnitHistoryPhoto key={photo.id} url={photo.url} label={`Foto ${label.toLocaleLowerCase("id-ID")} ${index + 1}`} />)}
                        </ul>
                      </article>
                    ))}
                    {!pair.after ? <p className="text-sm text-ws-text">Belum ada catatan penerimaan kembali.</p> : null}
                  </section>
                ) : null}

                {showForm ? (
                  <section className="border-t border-ws-divider pt-5">
                    <h3 className="text-sm font-bold text-ws-strong">Penerimaan unit</h3>
                    <p className="mt-1 text-sm leading-6">Periksa kondisi dan lampirkan foto terbaru. Supervisor perlu memverifikasi unit sebelum dapat dipinjamkan kembali.</p>
                    <fieldset disabled={locked} className="mt-5 min-w-0 space-y-5 disabled:opacity-70">
                      <div>
                        <label htmlFor={`${headingId}-condition`} className="text-sm font-medium text-ws-strong">Kondisi unit <span aria-hidden="true">*</span></label>
                        <select id={`${headingId}-condition`} name="condition" required value={condition} onChange={(event) => setCondition(conditionSchema.parse(event.currentTarget.value))} aria-invalid={Boolean(validation.errors[`${headingId}-condition`])} className={inputClass}>
                          <option value="GOOD">Baik</option><option value="MINOR_DAMAGE">Rusak ringan</option><option value="DAMAGED">Rusak</option><option value="MISSING_PART">Komponen kurang</option>
                        </select>
                        <FieldError id={`${headingId}-condition-error`} message={validation.errors[`${headingId}-condition`]} />
                      </div>
                      <div>
                        <label htmlFor={`${headingId}-location`} className="text-sm font-medium text-ws-strong">Lokasi Housekeeping <span aria-hidden="true">*</span></label>
                        <select id={`${headingId}-location`} name="locationId" required defaultValue="" aria-invalid={Boolean(validation.errors[`${headingId}-location`])} className={inputClass}>
                          <option value="">Pilih lokasi penerimaan</option>
                          {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
                        </select>
                        <FieldError id={`${headingId}-location-error`} message={validation.errors[`${headingId}-location`]} />
                        {locations.length === 0 ? <p className="mt-2 text-xs text-ws-danger">Belum ada lokasi aktif untuk menerima unit.</p> : null}
                      </div>
                      <div className="grid gap-5 sm:grid-cols-2">
                        <div>
                          <label htmlFor={`${headingId}-received-from`} className="text-sm font-medium text-ws-strong">Diserahkan oleh <span aria-hidden="true">*</span></label>
                          <input id={`${headingId}-received-from`} name="receivedFrom" required maxLength={100} autoComplete="off" aria-invalid={Boolean(validation.errors[`${headingId}-received-from`])} className={inputClass} />
                          <FieldError id={`${headingId}-received-from-error`} message={validation.errors[`${headingId}-received-from`]} />
                        </div>
                        <div>
                          <label htmlFor={`${headingId}-occurred-at`} className="text-sm font-medium text-ws-strong">Waktu penerimaan (WIB) <span aria-hidden="true">*</span></label>
                          <input id={`${headingId}-occurred-at`} name="occurredAt" type="datetime-local" required value={initialTime} onChange={(event) => setInitialTime(event.currentTarget.value)} aria-invalid={Boolean(validation.errors[`${headingId}-occurred-at`])} className={inputClass} />
                          <FieldError id={`${headingId}-occurred-at-error`} message={validation.errors[`${headingId}-occurred-at`]} />
                        </div>
                        <div>
                          <label htmlFor={`${headingId}-performed-by`} className="text-sm font-medium text-ws-strong">Pelaksana perbaikan{workRequired ? <span aria-hidden="true"> *</span> : <span className="font-normal text-ws-text"> (jika ada)</span>}</label>
                          <input id={`${headingId}-performed-by`} name="performedBy" required={workRequired} maxLength={100} autoComplete="off" aria-invalid={Boolean(validation.errors[`${headingId}-performed-by`])} aria-describedby={`${headingId}-work-requirement`} className={inputClass} />
                          <FieldError id={`${headingId}-performed-by-error`} message={validation.errors[`${headingId}-performed-by`]} />
                        </div>
                        <div>
                          <label htmlFor={`${headingId}-work-completed-at`} className="text-sm font-medium text-ws-strong">Waktu pekerjaan selesai{workRequired ? <span aria-hidden="true"> *</span> : <span className="font-normal text-ws-text"> (jika ada)</span>}</label>
                          <input id={`${headingId}-work-completed-at`} name="workCompletedAt" type="datetime-local" required={workRequired} aria-invalid={Boolean(validation.errors[`${headingId}-work-completed-at`])} aria-describedby={`${headingId}-work-requirement`} className={inputClass} />
                          <FieldError id={`${headingId}-work-completed-at-error`} message={validation.errors[`${headingId}-work-completed-at`]} />
                        </div>
                      </div>
                      <p id={`${headingId}-work-requirement`} className="text-xs leading-5">Pelaksana dan waktu selesai diisi jika hasil perbaikan mengubah kondisi unit.</p>
                      <div>
                        <label htmlFor={`${headingId}-work-performed`} className="text-sm font-medium text-ws-strong">Hasil pemeriksaan dan pekerjaan <span aria-hidden="true">*</span></label>
                        <textarea id={`${headingId}-work-performed`} name="workPerformed" required maxLength={2000} rows={4} aria-invalid={Boolean(validation.errors[`${headingId}-work-performed`])} className={`${inputClass} resize-none py-3`} />
                        <p className="mt-2 text-xs leading-5">Catat hasil penerimaan atau pekerjaan yang dilakukan. Maksimal 2.000 karakter.</p>
                        <FieldError id={`${headingId}-work-performed-error`} message={validation.errors[`${headingId}-work-performed`]} />
                      </div>
                      <UnitPhotoField index={0} purpose="receipt" error={validation.errors["receipt-unit-photo-0"]} />
                    </fieldset>
                  </section>
                ) : null}

                {pair?.after ? <p role="status" className="border-t border-ws-divider pt-4 text-sm text-ws-success">Unit sudah diterima kembali. Bukti penyerahan dan penerimaan tersimpan di riwayat unit.</p> : null}
                {pair && !pair.after && !canReceive ? <p className="border-t border-ws-divider pt-4 text-sm">Bukti penyerahan tersedia. Akun ini tidak dapat mencatat penerimaan unit.</p> : null}
                {pair && !pair.after && canReceive && locations.length === 0 ? <p className="text-sm">Penerimaan memerlukan lokasi Housekeeping yang aktif.</p> : null}
                {error ? <p role="alert" className="text-sm leading-6 text-ws-danger">{error}</p> : null}
                {expired ? <a href="/login" target="_blank" rel="noopener noreferrer" className="ws-button-secondary">Masuk kembali (tab baru)</a> : null}
              </div>

              <footer className="flex shrink-0 flex-wrap justify-end gap-3 border-t border-ws-divider px-5 py-4 sm:px-6">
                {phase === "retry" || phase === "reload" ? <button type="button" disabled={pending} onClick={() => window.location.reload()} className="ws-button-secondary">Muat ulang data</button> : null}
                {phase === "retry" ? null : <button type="button" disabled={pending} onClick={close} className="ws-button-secondary">{phase === "reload" ? "Tutup" : "Batal"}</button>}
                {phase === "reload" ? null : showForm ? <button type="submit" disabled={pending || (locations.length === 0 && phase !== "retry")} className={primaryClass}>{pending ? "Menyimpan…" : phase === "retry" ? "Periksa penyimpanan" : "Simpan penerimaan"}</button> : null}
              </footer>
            </form>
          )}
        </dialog>,
        document.body,
      ) : null}
    </>
  );
}
