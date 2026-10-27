"use client";

import {
  useEffect,
  useRef,
  useState,
  type SubmitEvent,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FieldError } from "@/components/field-error";
import { WorkspaceControlIcon } from "@/components/workspace-control-icon";
import { useInventoryForm } from "@/lib/use-inventory-form";
import { conditionLabels } from "@/lib/unit-state-labels";
import { unitDisplayName } from "@/lib/unit-display-name";
import {
  confirmedUnitVerification,
  type VerificationPayload,
  type VerificationUnit,
} from "@/lib/unit-verification";
import { verifyUnitsInputSchema } from "@/server/verify-units-input";
import { prepareUnitPhotoUpload } from "@/lib/stock-upload";
import { UnitPhotoField } from "./unit-photo-field";
import { VerificationUnitPicker } from "./verification-unit-picker";

type Phase = "edit" | "retry" | "reload" | "saved";
type Attempt = {
  payload: VerificationPayload;
  photos: File[][];
  upload?: Awaited<ReturnType<typeof prepareUnitPhotoUpload>>;
};
const failureSchema = (value: unknown): value is { error: string; message?: string } =>
  typeof value === "object" && value !== null && "error" in value && typeof value.error === "string";

const inputClass = "mt-2 min-h-11 w-full rounded-md border border-ws-sidebar/40 bg-ws-surface px-3 text-sm text-ws-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ws-primary disabled:opacity-60";
const primaryClass = "inline-flex min-h-11 items-center justify-center rounded-md bg-ws-primary px-4 text-sm font-medium text-white hover:bg-ws-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ws-primary disabled:cursor-wait disabled:opacity-60";

export function VerifyUnitsDialog({ item }: { item: { id: string; name: string } }) {
  const router = useRouter();
  const validation = useInventoryForm();
  const dialog = useRef<HTMLDialogElement>(null);
  const attempt = useRef<Attempt | null>(null);
  const inFlight = useRef(false);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<VerificationUnit[]>([]);
  const [openUnit, setOpenUnit] = useState<string | null>(null);
  const [pickerRevision, setPickerRevision] = useState(0);
  const [phase, setPhase] = useState<Phase>("edit");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [expired, setExpired] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const locked = pending || phase !== "edit";

  useEffect(() => {
    if (!open) return;
    const element = dialog.current;
    if (!element) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    if (!element.open) element.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      if (element.open) element.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [open]);

  useEffect(() => {
    if (phase !== "saved") return;
    dialog.current?.querySelector<HTMLButtonElement>("[data-success-close]")?.focus();
  }, [phase]);

  useEffect(() => {
    if (!pending && phase !== "retry") return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [pending, phase]);

  function show() {
    if (phase !== "retry" && phase !== "reload") {
      attempt.current = null;
      setSelected([]);
      setOpenUnit(null);
      setError("");
      setExpired(false);
      setSavedCount(0);
      validation.reset();
      setPhase("edit");
    }
    setOpen(true);
  }

  function close() {
    if (inFlight.current || phase === "retry") return;
    setOpen(false);
  }

  function toggleUnit(unit: VerificationUnit) {
    if (inFlight.current || phase !== "edit") return;
    const exists = selected.some((entry) => entry.id === unit.id);
    if (!exists && selected.length >= 100) {
      setError("Maksimal 100 unit dalam satu verifikasi.");
      return;
    }
    setSelected((current) => exists ? current.filter((entry) => entry.id !== unit.id) : [...current, unit]);
    setOpenUnit((current) => exists ? current === unit.id ? null : current : unit.id);
    validation.reset();
    setError("");
  }

  async function send(current: Attempt) {
    const recovering = phase === "retry";
    inFlight.current = true;
    setPending(true);
    setError("");
    setExpired(false);
    try {
      try {
        current.upload ??= await prepareUnitPhotoUpload(current.payload, current.photos);
      } catch (cause) {
        if (!recovering) attempt.current = null;
        setPhase("edit");
        setError(cause instanceof Error ? cause.message : "Foto verifikasi belum dapat disiapkan.");
        return;
      }

      const response = await fetch("/api/unit-verifications", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": current.upload.contentType },
        body: current.upload.body,
      });
      const body: unknown = await response.json().catch(() => null);

      if (response.status === 200 || response.status === 201) {
        const confirmed = confirmedUnitVerification(
          body,
          current.payload,
          current.photos,
          new Map(selected.map((unit) => [unit.id, unit.condition])),
        );
        if (!confirmed) throw new Error("Respons verifikasi belum dapat dipastikan.");
        setSavedCount(current.payload.units.length);
        attempt.current = null;
        setPhase("saved");
        router.refresh();
        return;
      }

      const failure = failureSchema(body) ? body : null;
      const message = failure?.message || "Verifikasi belum berhasil disimpan.";
      switch (failure?.error) {
        case "STALE_UNIT":
        case "UNIT_STATE_CONFLICT":
        case "UNITS_NOT_FOUND":
        case "OUTSTANDING_BORROWING":
          attempt.current = null;
          setPhase("reload");
          setError(`${message} Muat ulang daftar unit sebelum melanjutkan.`);
          return;
        case "REQUEST_CONFLICT":
          attempt.current = null;
          setPhase("reload");
          setError("ID permintaan sudah digunakan. Muat ulang daftar unit untuk membuat verifikasi baru.");
          return;
        case "RETRY_REQUIRED":
          attempt.current = current;
          setPhase("retry");
          setError("Hasil penyimpanan belum pasti. Coba ulang dengan data dan foto yang sama.");
          return;
        case "INVALID_INPUT":
        case "INVALID_PHOTO":
        case "PHOTOS_REQUIRED":
        case "PAYLOAD_TOO_LARGE":
          attempt.current = null;
          setPhase("edit");
          setError(message);
          return;
        default:
          if (response.status === 401) {
            setExpired(true);
            setError("Sesi berakhir. Masuk kembali, lalu coba ulang verifikasi yang sama.");
            attempt.current = current;
            setPhase("retry");
          } else if (response.status === 403) {
            attempt.current = null;
            setPhase("edit");
            setError("Akun ini tidak memiliki izin untuk melakukan verifikasi.");
          } else {
            throw new Error(message);
          }
      }
    } catch (cause) {
      attempt.current = current;
      setPhase("retry");
      setError(cause instanceof Error ? cause.message : "Hasil penyimpanan belum pasti. Coba ulang dengan data dan foto yang sama.");
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
    if (selected.length === 0) {
      setError("Pilih minimal satu unit untuk diverifikasi.");
      return;
    }

    const form = event.currentTarget;
    if (!validation.validate(form)) {
      const invalid = form.querySelector<HTMLElement>(":invalid");
      setOpenUnit(invalid?.closest<HTMLElement>("[data-unit-id]")?.dataset.unitId ?? null);
      return;
    }

    const values = new FormData(form);
    const parsed = verifyUnitsInputSchema.safeParse({
      requestId: crypto.randomUUID(),
      units: selected.map((unit) => ({
        unitId: unit.id,
        expectedUpdatedAt: unit.updatedAt,
        result: values.get(`result-${unit.id}`),
        notes: values.get(`notes-${unit.id}`),
      })),
    });
    if (!parsed.success) {
      setError("Periksa hasil pemeriksaan dan catatan untuk setiap unit.");
      return;
    }
    const photos = selected.map((_, index) => values.getAll(`photo-${index}`).filter((file): file is File => file instanceof File && file.size > 0));
    if (photos.some((files) => files.length === 0)) {
      setError("Tambahkan minimal satu foto untuk setiap unit.");
      return;
    }
    const current = { payload: parsed.data, photos };
    attempt.current = current;
    await send(current);
  }

  function reloadUnits() {
    if (pending || inFlight.current) return;
    attempt.current = null;
    setSelected([]);
    setOpenUnit(null);
    setError("");
    setExpired(false);
    validation.reset();
    setPickerRevision((value) => value + 1);
    setPhase("edit");
  }

  const dialogView = open && typeof document !== "undefined" ? createPortal(
    <dialog
      ref={dialog}
      aria-labelledby={`verification-heading-${item.id}`}
      onClick={(event) => {
        event.stopPropagation();
        if (event.target === event.currentTarget && phase !== "retry" && !pending) close();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        close();
      }}
      className="fixed inset-4 z-50 m-0 max-h-none w-auto max-w-none overflow-hidden rounded-md border-0 bg-white p-0 text-ws-text shadow-xl outline-none backdrop:bg-black/40 open:flex open:flex-col sm:inset-y-8 sm:inset-x-1/2 sm:w-[min(720px,calc(100vw-4rem))] sm:-translate-x-1/2"
    >
      {phase === "saved" ? (
        <section className="flex min-h-16 items-center justify-between gap-4 px-4 py-3 sm:px-5" aria-label="Verifikasi tersimpan">
          <h2 id={`verification-heading-${item.id}`} className="text-sm font-medium text-ws-strong">Verifikasi {savedCount} unit tersimpan.</h2>
          <button type="button" data-success-close aria-label="Tutup konfirmasi verifikasi" onClick={close} className="inline-flex size-11 shrink-0 items-center justify-center rounded text-ws-strong hover:bg-ws-inset focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ws-primary"><WorkspaceControlIcon name="close" /></button>
        </section>
      ) : (
        <form noValidate onSubmit={submit} onInput={validation.onInput} className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <header className="flex shrink-0 items-center justify-between gap-3 border-b border-ws-divider px-4 py-3 sm:px-5">
            <div className="min-w-0">
              <h2 id={`verification-heading-${item.id}`} className="text-sm font-semibold text-ws-strong">Verifikasi unit</h2>
              <p className="mt-1 truncate text-xs text-ws-muted">{item.name}</p>
            </div>
            <button type="button" aria-label="Tutup verifikasi unit" disabled={pending || phase === "retry"} onClick={close} className="inline-flex size-11 shrink-0 items-center justify-center rounded text-ws-strong hover:bg-ws-inset focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ws-primary disabled:opacity-50"><WorkspaceControlIcon name="close" /></button>
          </header>
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
            <p className="text-sm leading-6">Pilih unit yang perlu diperiksa. Untuk setiap unit, isi hasil pemeriksaan, catatan, dan minimal satu foto.</p>
            <fieldset disabled={locked} className="space-y-5 disabled:opacity-70">
              <section>
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-sm font-semibold text-ws-strong">Pilih unit</h3>
                  <span className="text-xs tabular-nums text-ws-muted">{selected.length}/100 dipilih</span>
                </div>
                <VerificationUnitPicker
                  key={`${item.id}-${pickerRevision}`}
                  itemId={item.id}
                  selectedIds={selected.map((unit) => unit.id)}
                  disabled={locked}
                  onToggle={toggleUnit}
                />
              </section>
              <section>
                <h3 className="text-sm font-semibold text-ws-strong">Hasil pemeriksaan</h3>
                {selected.length === 0 ? (
                  <p className="mt-2 text-sm text-ws-muted">Pilih unit untuk mengisi hasil dan bukti pemeriksaan.</p>
                ) : (
                  <div className="mt-3 space-y-3">
                    {selected.map((unit, index) => (
                      <details key={unit.id} data-unit-id={unit.id} open={openUnit === unit.id} className="rounded-md border border-ws-divider">
                        <summary
                          aria-expanded={openUnit === unit.id}
                          onClick={(event) => {
                            event.preventDefault();
                            if (!locked) setOpenUnit((current) => current === unit.id ? null : unit.id);
                          }}
                          className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-3 py-3 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ws-primary"
                        >
                          <span className="min-w-0">
                            <span className="block break-words text-sm font-medium text-ws-strong">{unitDisplayName(unit)}</span>
                            <span className="mt-1 block text-xs text-ws-muted">{unit.unitCode} · Kondisi tercatat: {conditionLabels[unit.condition]}</span>
                          </span>
                          <span className={`shrink-0 text-ws-strong transition-transform ${openUnit === unit.id ? "rotate-90" : ""}`}><WorkspaceControlIcon name="caretRight" /></span>
                        </summary>
                        <div className="grid gap-4 border-t border-ws-divider px-3 py-4">
                          <div>
                            <label htmlFor={`verification-result-${unit.id}`} className="block text-sm font-medium text-ws-strong">Hasil pemeriksaan <span aria-hidden="true">*</span></label>
                            <select id={`verification-result-${unit.id}`} name={`result-${unit.id}`} required data-required-message="Pilih hasil pemeriksaan." aria-invalid={Boolean(validation.errors[`verification-result-${unit.id}`])} aria-describedby={`verification-result-${unit.id}-error`} className={inputClass} defaultValue="">
                              <option value="" disabled>Pilih hasil</option>
                              <option value="FIT_FOR_USE">Layak digunakan</option>
                              <option value="UNFIT_FOR_USE">Belum layak digunakan</option>
                            </select>
                            <FieldError id={`verification-result-${unit.id}-error`} message={validation.errors[`verification-result-${unit.id}`]} />
                          </div>
                          <div>
                            <label htmlFor={`verification-notes-${unit.id}`} className="block text-sm font-medium text-ws-strong">Catatan pemeriksaan <span aria-hidden="true">*</span></label>
                            <textarea id={`verification-notes-${unit.id}`} name={`notes-${unit.id}`} required maxLength={2000} rows={3} data-required-message="Catatan pemeriksaan wajib diisi." aria-invalid={Boolean(validation.errors[`verification-notes-${unit.id}`])} aria-describedby={`verification-notes-${unit.id}-error`} className={`${inputClass} resize-none py-3`} />
                            <FieldError id={`verification-notes-${unit.id}-error`} message={validation.errors[`verification-notes-${unit.id}`]} />
                          </div>
                          <UnitPhotoField index={index} purpose="verification" error={validation.errors[`verification-unit-photo-${index}`]} />
                          <button type="button" onClick={() => toggleUnit(unit)} className="ws-button-secondary min-h-11 justify-self-start">Hapus dari pilihan</button>
                        </div>
                      </details>
                    ))}
                  </div>
                )}
              </section>
            </fieldset>
            {error ? <p role="alert" className="rounded-md border border-ws-danger/30 px-3 py-2 text-sm text-ws-danger">{error}</p> : null}
            {expired ? <Link href="/login" className="inline-flex min-h-11 items-center text-sm text-ws-primary underline underline-offset-4">Masuk kembali</Link> : null}
          </div>
          <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-ws-divider bg-white px-4 py-3 sm:px-5">
            {phase === "reload" ? (
              <>
                <button type="button" onClick={close} className="ws-button-secondary min-h-11">Tutup</button>
                <button type="button" disabled={pending} onClick={reloadUnits} className={primaryClass}>Muat ulang unit</button>
              </>
            ) : phase === "retry" ? (
              <button type="submit" disabled={pending} className={primaryClass}>{pending ? "Menyimpan…" : "Coba ulang penyimpanan"}</button>
            ) : (
              <>
                <button type="button" disabled={pending} onClick={close} className="ws-button-secondary min-h-11">Batal</button>
                <button type="submit" disabled={pending || selected.length === 0} className={primaryClass}>{pending ? "Menyimpan…" : `Simpan verifikasi (${selected.length})`}</button>
              </>
            )}
          </footer>
        </form>
      )}
    </dialog>,
    document.body,
  ) : null;

  return (
    <>
      <button type="button" aria-haspopup="dialog" onClick={show} className="ws-button-secondary min-h-11">Verifikasi unit</button>
      {dialogView}
    </>
  );
}
