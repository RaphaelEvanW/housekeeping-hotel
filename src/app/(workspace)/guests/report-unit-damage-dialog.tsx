"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type SubmitEvent } from "react";
import { createPortal } from "react-dom";
import { z } from "zod";
import { FieldError } from "@/components/field-error";
import { WorkspaceControlIcon } from "@/components/workspace-control-icon";
import {
  confirmedDamageReport,
  type DamageReportPayload,
} from "@/lib/unit-damage-report";
import {
  confirmedUnitHandover,
  type UnitHandoverPayload,
} from "@/lib/unit-handover";
import { prepareUnitPhotoUpload } from "@/lib/stock-upload";
import { useInventoryForm } from "@/lib/use-inventory-form";
import { conditionLabels } from "@/lib/unit-state-labels";
import { reportUnitDamageInputSchema } from "@/server/report-unit-damage-input";
import { unitConditionUpdateInputSchema } from "@/server/unit-condition-update-input";
import { handoverUnitInputSchema } from "@/server/unit-maintenance-input";
import { UnitPhotoField } from "../inventory/unit-photo-field";

type Unit = {
  id: string;
  displayName: string;
  itemName: string;
  unitCode: string;
};

type ConditionUpdatePayload = z.infer<typeof unitConditionUpdateInputSchema>;
type GeneralUpdate = Pick<ConditionUpdatePayload, "condition" | "expectedUpdatedAt">;

type Phase = "edit" | "retry" | "reload" | "saved";

type Attempt = {
  payload:
    | DamageReportPayload
    | ConditionUpdatePayload
    | UnitHandoverPayload;
  endpoint:
    | "/api/item-unit-damage-reports"
    | "/api/item-unit-condition-updates"
    | "/api/unit-maintenance/handover";
  photos: File[];
  upload?: Awaited<ReturnType<typeof prepareUnitPhotoUpload>>;
};

const failureSchema = z.object({ error: z.string() });

const stateMessages: Record<string, string> = {
  UNIT_NOT_FOUND: "Unit tidak lagi tersedia. Muat ulang data.",
  UNIT_STATE_CONFLICT: "Status unit sudah berubah. Muat ulang data sebelum mencoba kembali.",
  STALE_UNIT: "Data unit sudah berubah. Muat ulang sebelum melakukan tindakan lagi.",
  OUTSTANDING_BORROWING:
    "Unit masih tercatat dipinjam. Terima pengembaliannya terlebih dahulu.",
  GOOD_RETURN_REQUIRED:
    "Pembaruan ini hanya tersedia setelah pengembalian terakhir dicatat dalam kondisi Baik.",
  MAINTENANCE_OPEN:
    "Unit masih memiliki penyerahan ke Engineering yang belum diterima kembali. Muat ulang dan periksa riwayat unit.",
};

const primaryClass =
  "inline-flex min-h-11 items-center justify-center rounded-md border border-ws-primary bg-ws-primary px-4 text-sm font-medium text-white transition-colors hover:border-ws-primary-hover hover:bg-ws-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ws-primary disabled:cursor-not-allowed disabled:opacity-60";

const inputClass =
  "mt-2 min-h-11 w-full rounded-md border border-ws-control bg-ws-inset px-3 text-sm text-ws-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ws-primary";

function initialLocalTime() {
  return new Date(Date.now() + 7 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 16);
}

export function ReportUnitDamageDialog({
  unit,
  general,
  handover,
  onDone,
}: {
  unit: Unit;
  general?: GeneralUpdate;
  handover?: GeneralUpdate;
  onDone?: () => void;
}) {
  const router = useRouter();
  const validation = useInventoryForm();
  const dialog = useRef<HTMLDialogElement>(null);
  const conditionInput = useRef<HTMLSelectElement>(null);
  const successClose = useRef<HTMLButtonElement>(null);
  const attempt = useRef<Attempt | null>(null);
  const inFlight = useRef(false);

  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [phase, setPhase] = useState<Phase>("edit");
  const [expired, setExpired] = useState(false);
  const [error, setError] = useState("");
  const [occurredAt, setOccurredAt] = useState("");

  const locked = pending || phase !== "edit";
  const context = handover ?? general;
  const title = handover ? "Serahkan ke Engineering" : "Perbarui kondisi";
  const headingId = `${handover ? "unit-handover" : general ? "unit-condition" : "damage-report"}-${unit.id}`;
  const fixedCondition =
    context && context.condition !== "GOOD" ? context.condition : null;
  const conditionId = `${headingId}-condition`;
  const notesId = `${headingId}-notes`;
  const recipientId = `${headingId}-recipient`;
  const occurredAtId = `${headingId}-occurred-at`;

  useEffect(() => {
    if (!open) return;

    const element = dialog.current;
    if (!element) return;

    const overflow = document.body.style.overflow;
    const ownsScrollLock = overflow !== "hidden";
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    element.showModal();
    if (ownsScrollLock) document.body.style.overflow = "hidden";
    conditionInput.current?.focus({ preventScroll: true });

    return () => {
      element.close();
      if (ownsScrollLock) document.body.style.overflow = overflow;
      if (previousFocus?.isConnected) {
        previousFocus.focus({ preventScroll: true });
      }
    };
  }, [open]);

  useEffect(() => {
    if (phase === "saved") {
      successClose.current?.focus({ preventScroll: true });
    }
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
      setExpired(false);
      setError("");
      setOccurredAt(initialLocalTime());
    }
    setOpen(true);
  }

  function close() {
    if (inFlight.current || phase === "retry") return;
    setOpen(false);
    if (phase === "saved") onDone?.();
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
        current.upload ??= await prepareUnitPhotoUpload(
          current.payload,
          [current.photos],
        );
      } catch (failure) {
        if (!recovering) attempt.current = null;
        setError(
          failure instanceof Error
            ? failure.message
            : "Unggahan belum dapat disiapkan.",
        );
        return;
      }

      const upload = current.upload;
      const response = await fetch(current.endpoint, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": upload.contentType },
        body: upload.body,
      });

      const body: unknown = await response.json().catch(() => null);

      if (response.status === 200 || response.status === 201) {
        const confirmed =
          "handedOverTo" in current.payload
            ? confirmedUnitHandover(
                body,
                current.payload,
                current.photos.length,
              )
            : confirmedDamageReport(
                body,
                current.payload,
                current.photos.length,
              );

        if (!confirmed) throw new Error("Unconfirmed unit operation");

        attempt.current = null;
        setPhase("saved");
        router.refresh();
        return;
      }

      const failure = failureSchema.safeParse(body);
      if (!failure.success || response.status >= 500) {
        throw new Error("Unconfirmed damage report response");
      }

      const code = failure.data.error;

      if (code === "REQUEST_CONFLICT") {
        setPhase("reload");
        setError(
          "Permintaan ini tidak dapat dilanjutkan. Muat ulang data dan periksa riwayat unit sebelum membuat pembaruan baru.",
        );
        return;
      }

      if (code === "RETRY_REQUIRED") {
        setPhase("retry");
        setError(
          "Data sedang berubah. Periksa penyimpanan lagi dengan data dan foto yang sama.",
        );
        return;
      }

      const stateError = stateMessages[code];
      if (stateError) {
        attempt.current = null;
        setPhase("reload");
        setError(stateError);
        return;
      }

      if ([400, 401, 403, 413, 415].includes(response.status)) {
        if (!recovering) attempt.current = null;
        setPhase(recovering ? "retry" : "edit");
        setExpired(response.status === 401);
        setError(
          response.status === 401
            ? "Sesi Anda berakhir. Masuk kembali, lalu lanjutkan penyimpanan."
            : response.status === 403
              ? handover
                ? "Akun Anda tidak memiliki izin menyerahkan unit ke Engineering."
                : "Akun Anda tidak memiliki izin memperbarui kondisi unit."
              : handover && code === "INVALID_TIME"
                ? "Waktu penyerahan tidak boleh berada di masa depan."
                : handover && code === "PHOTOS_REQUIRED"
                  ? "Lampirkan minimal satu foto bukti kerusakan."
                  : response.status === 413
                    ? "Total unggahan maksimal 16 MiB. Kurangi ukuran atau jumlah foto."
                    : code === "INVALID_PHOTO"
                      ? "Foto tidak dapat diproses. Gunakan JPEG, PNG, atau WebP statis maksimal 2 MiB per foto."
                      : "Periksa kembali kondisi, catatan, dan foto yang dipilih.",
        );
        return;
      }

      throw new Error("Unconfirmed damage report rejection");
    } catch {
      setPhase("retry");
      setError(
        "Hasil penyimpanan belum dapat dipastikan. Periksa penyimpanan lagi dengan data dan foto yang sama, atau muat ulang untuk memeriksa riwayat unit.",
      );
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || phase === "reload" || phase === "saved") {
      return;
    }

    if (phase === "retry") {
      if (attempt.current) await send(attempt.current);
      return;
    }

    if (!validation.validate(event.currentTarget)) return;

    const values = new FormData(event.currentTarget);
    const fields = {
      requestId: crypto.randomUUID(),
      unitId: unit.id,
      condition: String(values.get("condition") ?? ""),
      notes: String(values.get("notes") ?? ""),
    };
    const rawTime = String(values.get("occurredAt") ?? "");
    const occurredAt = new Date(`${rawTime}:00+07:00`);
    if (
      handover &&
      (!Number.isFinite(occurredAt.getTime()) ||
        occurredAt.getTime() > Date.now())
    ) {
      setError("Isi waktu penyerahan yang valid dan tidak berada di masa depan.");
      return;
    }

    const parsed = handover
      ? handoverUnitInputSchema.safeParse({
          ...fields,
          expectedUpdatedAt: handover.expectedUpdatedAt,
          handedOverTo: String(values.get("handedOverTo") ?? ""),
          occurredAt: occurredAt.toISOString(),
        })
      : general
        ? unitConditionUpdateInputSchema.safeParse({
            ...fields,
            expectedUpdatedAt: general.expectedUpdatedAt,
          })
        : reportUnitDamageInputSchema.safeParse(fields);

    if (!parsed.success) {
      setError(
        handover
          ? "Periksa penerima, waktu penyerahan, kondisi, dan catatan kerusakan."
          : general
          ? "Pilih kondisi unit dan isi catatan pemeriksaan."
          : "Pilih kondisi unit dan isi catatan pembaruan.",
      );
      return;
    }

    const current: Attempt = {
      payload: parsed.data,
      endpoint: handover
        ? "/api/unit-maintenance/handover"
        : general
          ? "/api/item-unit-condition-updates"
          : "/api/item-unit-damage-reports",
      photos: values
        .getAll("photo-0")
        .filter(
          (value): value is File =>
            value instanceof File && value.size > 0,
        ),
    };

    attempt.current = current;
    await send(current);
  }

  return (
    <>
      <button
        type="button"
        onClick={show}
        aria-haspopup="dialog"
        className="ws-button-secondary"
      >
        {title}
      </button>

      {open ? createPortal(
        <dialog
          ref={dialog}
          aria-labelledby={headingId}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === "Escape") event.stopPropagation();
          }}
          onCancel={(event) => {
            event.preventDefault();
            event.stopPropagation();
            close();
          }}
          className={`fixed inset-0 m-auto w-[calc(100%-24px)] flex-col overflow-clip rounded-lg border-0 bg-ws-surface p-0 font-workspace text-ws-text shadow-xl backdrop:bg-black/40 open:flex [color-scheme:light] ${
            phase === "saved"
              ? "max-h-[calc(100svh-24px)] max-w-sm"
              : "h-[min(720px,calc(100svh-24px))] max-h-[calc(100svh-24px)] max-w-[600px]"
          }`}
        >
          {phase === "saved" ? (
            <div className="flex items-center justify-between gap-4 p-4">
              <h2 id={headingId} className="sr-only">
                {handover ? "Penyerahan tersimpan" : "Pembaruan kondisi tersimpan"}
              </h2>
              <p role="status" className="text-sm text-ws-success">
                {handover
                  ? "Penyerahan ke Engineering tersimpan."
                  : "Pembaruan kondisi tersimpan di riwayat unit."}
              </p>
              <button
                ref={successClose}
                type="button"
                onClick={close}
                aria-label="Tutup"
                title="Tutup"
                className="ws-button-secondary size-11 shrink-0 p-0"
              >
                <WorkspaceControlIcon name="close" />
              </button>
            </div>
          ) : (
            <form
              noValidate
              onSubmit={submit}
              onInput={(event) => {
                validation.onInput(event);
                if (phase === "edit") {
                  setExpired(false);
                  setError("");
                }
              }}
              aria-busy={pending}
              className="flex min-h-0 flex-1 flex-col overflow-clip"
            >
              <header className="shrink-0 border-b border-ws-divider px-5 py-4 sm:px-6">
                <div className="flex items-center justify-between gap-3">
                  <h2
                    id={headingId}
                    className="text-sm font-medium text-ws-strong"
                  >
                    {title}
                  </h2>
                  <button
                    type="button"
                    onClick={close}
                    disabled={pending || phase === "retry"}
                    aria-label={`Tutup ${title.toLocaleLowerCase("id-ID")}`}
                    title="Tutup"
                    className="ws-button-secondary size-11 shrink-0 p-0"
                  >
                    <WorkspaceControlIcon name="close" />
                  </button>
                </div>

                <div className="mt-3 border-t border-ws-divider pt-4">
                  <p className="break-words text-lg font-semibold text-ws-strong">
                    {unit.displayName}
                  </p>
                  <p className="mt-1 break-words text-xs leading-5">
                    {unit.itemName} · {unit.unitCode}
                  </p>
                </div>
              </header>

              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-5 sm:px-6">
                {handover ? (
                  <div className="border-b border-ws-divider pb-4">
                    <dl className="flex flex-wrap items-baseline justify-between gap-2">
                      <dt className="text-xs text-ws-text">Kondisi tercatat</dt>
                      <dd className="text-sm font-semibold text-ws-strong">
                        {conditionLabels[handover.condition]}
                      </dd>
                    </dl>
                    <p className="mt-3 text-sm leading-6">
                      Catat penerima, waktu penyerahan, dan kondisi unit saat
                      diserahkan ke Engineering.
                    </p>
                  </div>
                ) : general ? (
                  <div className="border-b border-ws-divider pb-4">
                    <dl className="flex flex-wrap items-baseline justify-between gap-2">
                      <dt className="text-xs text-ws-text">Kondisi tercatat</dt>
                      <dd className="text-sm font-semibold text-ws-strong">
                        {conditionLabels[general.condition]}
                      </dd>
                    </dl>
                    <p className="mt-3 text-sm leading-6">
                      {fixedCondition
                        ? "Tambahkan hasil pemeriksaan dan foto terbaru. Hasil perbaikan dicatat saat unit diterima kembali dari Engineering."
                        : "Perbarui kondisi unit sesuai hasil pemeriksaan dan lampirkan foto terbaru."}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm leading-6">
                    Catat kerusakan yang ditemukan setelah pengembalian
                    barang. Lampirkan hasil pemeriksaan dan foto terbaru.
                  </p>
                )}

                <fieldset
                  disabled={locked}
                  className="min-w-0 space-y-5 disabled:opacity-70"
                >
                  {handover ? (
                    <div className="grid gap-5 sm:grid-cols-2">
                      <div>
                        <label
                          htmlFor={recipientId}
                          className="text-sm font-medium text-ws-strong"
                        >
                          Penerima di Engineering <span aria-hidden="true">*</span>
                        </label>
                        <input
                          id={recipientId}
                          name="handedOverTo"
                          required
                          maxLength={100}
                          autoComplete="off"
                          aria-invalid={Boolean(validation.errors[recipientId])}
                          aria-describedby={
                            validation.errors[recipientId]
                              ? `${recipientId}-error`
                              : undefined
                          }
                          className={inputClass}
                        />
                        <FieldError
                          id={`${recipientId}-error`}
                          message={validation.errors[recipientId]}
                        />
                      </div>

                      <div>
                        <label
                          htmlFor={occurredAtId}
                          className="text-sm font-medium text-ws-strong"
                        >
                          Waktu penyerahan (WIB) <span aria-hidden="true">*</span>
                        </label>
                        <input
                          id={occurredAtId}
                          name="occurredAt"
                          type="datetime-local"
                          required
                          value={occurredAt}
                          onChange={(event) =>
                            setOccurredAt(event.currentTarget.value)
                          }
                          aria-invalid={Boolean(validation.errors[occurredAtId])}
                          aria-describedby={
                            validation.errors[occurredAtId]
                              ? `${occurredAtId}-error`
                              : undefined
                          }
                          className={inputClass}
                        />
                        <FieldError
                          id={`${occurredAtId}-error`}
                          message={validation.errors[occurredAtId]}
                        />
                      </div>
                    </div>
                  ) : null}
                  <div>
                    <label
                      htmlFor={conditionId}
                      className="text-sm font-medium text-ws-strong"
                    >
                      Kondisi unit <span aria-hidden="true">*</span>
                    </label>
                    <select
                      ref={conditionInput}
                      id={conditionId}
                      name="condition"
                      required
                      defaultValue={
                        fixedCondition ??
                        (handover ? "" : general?.condition ?? "")
                      }
                      aria-invalid={Boolean(validation.errors[conditionId])}
                      aria-describedby={[
                        fixedCondition ? `${conditionId}-help` : "",
                        validation.errors[conditionId] ? `${conditionId}-error` : "",
                      ].filter(Boolean).join(" ") || undefined}
                      className={inputClass}
                    >
                      {!context || (handover && !fixedCondition) ? (
                        <option value="">Pilih kondisi unit</option>
                      ) : null}
                      {general ? (
                        <option value="GOOD" disabled={fixedCondition !== null}>
                          Baik
                        </option>
                      ) : null}
                      <option
                        value="MINOR_DAMAGE"
                        disabled={
                          fixedCondition !== null &&
                          fixedCondition !== "MINOR_DAMAGE"
                        }
                      >
                        Rusak ringan
                      </option>
                      <option
                        value="DAMAGED"
                        disabled={
                          fixedCondition !== null && fixedCondition !== "DAMAGED"
                        }
                      >
                        Rusak
                      </option>
                      <option
                        value="MISSING_PART"
                        disabled={
                          fixedCondition !== null &&
                          fixedCondition !== "MISSING_PART"
                        }
                      >
                        Komponen kurang
                      </option>
                    </select>
                    {fixedCondition ? (
                      <p id={`${conditionId}-help`} className="mt-2 text-xs leading-5">
                        Jenis kerusakan mengikuti catatan unit yang sudah tersimpan.
                        Foto dan catatan baru tetap dapat ditambahkan.
                      </p>
                    ) : null}
                    <FieldError
                      id={`${conditionId}-error`}
                      message={validation.errors[conditionId]}
                    />
                  </div>

                  <div>
                    <label
                      htmlFor={notesId}
                      className="text-sm font-medium text-ws-strong"
                    >
                      {handover ? "Catatan kerusakan" : "Catatan pemeriksaan"}{" "}
                      <span aria-hidden="true">*</span>
                    </label>
                    <textarea
                      id={notesId}
                      name="notes"
                      required
                      maxLength={2000}
                      rows={4}
                      aria-invalid={Boolean(validation.errors[notesId])}
                      aria-describedby={`${notesId}-help${
                        validation.errors[notesId] ? ` ${notesId}-error` : ""
                      }`}
                      className={`${inputClass} resize-none py-3`}
                    />
                    <p
                      id={`${notesId}-help`}
                      className="mt-2 text-xs leading-5"
                    >
                      {handover
                        ? "Jelaskan kerusakan dan alasan unit diserahkan ke Engineering."
                        : "Jelaskan hasil pemeriksaan atau perkembangan kondisi unit."}{" "}
                      Maksimal 2.000 karakter.
                    </p>
                    <FieldError
                      id={`${notesId}-error`}
                      message={validation.errors[notesId]}
                    />
                  </div>

                  <UnitPhotoField
                    index={0}
                    purpose={handover ? "handover" : "condition"}
                    error={validation.errors[`${handover ? "handover" : "condition"}-unit-photo-0`]}
                  />
                </fieldset>

                {error ? (
                  <p role="alert" className="text-sm leading-6 text-ws-danger">
                    {error}
                  </p>
                ) : null}

                {expired ? (
                  <a
                    href="/login"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ws-button-secondary"
                  >
                    Masuk kembali (tab baru)
                  </a>
                ) : null}
              </div>

              <footer className="flex shrink-0 flex-wrap justify-end gap-3 border-t border-ws-divider px-5 py-4 sm:px-6">
                {phase === "retry" ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => window.location.reload()}
                    className="ws-button-secondary"
                  >
                    Muat ulang data
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={close}
                    className="ws-button-secondary"
                  >
                    {phase === "reload" ? "Tutup" : "Batal"}
                  </button>
                )}

                {phase === "reload" ? (
                  <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className={primaryClass}
                  >
                    Muat ulang data
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={pending}
                    className={primaryClass}
                  >
                    {pending
                      ? "Menyimpan…"
                      : phase === "retry"
                        ? "Periksa penyimpanan"
                        : handover
                          ? "Simpan penyerahan"
                          : "Simpan kondisi"}
                  </button>
                )}
              </footer>
            </form>
          )}
        </dialog>,
        document.body,
      ) : null}
    </>
  );
}
