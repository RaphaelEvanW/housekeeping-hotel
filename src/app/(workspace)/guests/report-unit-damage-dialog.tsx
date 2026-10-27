"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type SubmitEvent } from "react";
import { z } from "zod";
import { FieldError } from "@/components/field-error";
import { WorkspaceControlIcon } from "@/components/workspace-control-icon";
import {
  confirmedDamageReport,
  type DamageReportPayload,
} from "@/lib/unit-damage-report";
import { prepareUnitPhotoUpload } from "@/lib/stock-upload";
import { useInventoryForm } from "@/lib/use-inventory-form";
import { reportUnitDamageInputSchema } from "@/server/report-unit-damage-input";
import { UnitPhotoField } from "../inventory/unit-photo-field";

type Unit = {
  id: string;
  displayName: string;
  itemName: string;
  unitCode: string;
};

type Phase = "edit" | "retry" | "reload" | "saved";

type Attempt = {
  payload: DamageReportPayload;
  photos: File[];
  upload?: Awaited<ReturnType<typeof prepareUnitPhotoUpload>>;
};

const failureSchema = z.object({ error: z.string() });

const stateMessages: Record<string, string> = {
  UNIT_NOT_FOUND: "Unit tidak lagi tersedia. Muat ulang data.",
  UNIT_STATE_CONFLICT:
    "Status unit telah berubah. Muat ulang data sebelum memperbarui kondisinya.",
  OUTSTANDING_BORROWING:
    "Unit masih tercatat dipinjam. Terima pengembaliannya terlebih dahulu.",
  GOOD_RETURN_REQUIRED:
    "Pembaruan ini hanya tersedia setelah pengembalian terakhir dicatat dalam kondisi Baik.",
};

const primaryClass =
  "inline-flex min-h-11 items-center justify-center rounded-md border border-ws-primary bg-ws-primary px-4 text-sm font-medium text-white transition-colors hover:border-ws-primary-hover hover:bg-ws-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ws-primary disabled:cursor-not-allowed disabled:opacity-60";

const inputClass =
  "mt-2 min-h-11 w-full rounded-md border border-ws-control bg-ws-inset px-3 text-sm text-ws-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ws-primary";

export function ReportUnitDamageDialog({ unit }: { unit: Unit }) {
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

  const locked = pending || phase !== "edit";
  const headingId = `damage-report-${unit.id}`;
  const conditionId = `${headingId}-condition`;
  const notesId = `${headingId}-notes`;

  useEffect(() => {
    if (!open) return;

    const element = dialog.current;
    if (!element) return;

    const overflow = document.body.style.overflow;
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    element.showModal();
    document.body.style.overflow = "hidden";
    conditionInput.current?.focus({ preventScroll: true });

    return () => {
      element.close();
      document.body.style.overflow = overflow;
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
    }
    setOpen(true);
  }

  function close() {
    if (inFlight.current || phase === "retry") return;
    setOpen(false);
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
          { allowEmptyPhotos: true },
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
      const response = await fetch("/api/item-unit-damage-reports", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": upload.contentType },
        body: upload.body,
      });

      const body: unknown = await response.json().catch(() => null);

      if (response.status === 200 || response.status === 201) {
        if (
          !confirmedDamageReport(
            body,
            current.payload,
            current.photos.length,
          )
        ) {
          throw new Error("Unconfirmed damage report");
        }

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
              ? "Akun Anda tidak memiliki izin memperbarui kondisi unit."
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
    const parsed = reportUnitDamageInputSchema.safeParse({
      requestId: crypto.randomUUID(),
      unitId: unit.id,
      condition: String(values.get("condition") ?? ""),
      notes: String(values.get("notes") ?? ""),
    });

    if (!parsed.success) {
      setError("Pilih kondisi unit dan isi catatan pembaruan.");
      return;
    }

    const current: Attempt = {
      payload: parsed.data,
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
        Perbarui kondisi
      </button>

      {open ? (
        <dialog
          ref={dialog}
          aria-labelledby={headingId}
          onCancel={(event) => {
            event.preventDefault();
            close();
          }}
          className={`m-auto max-h-[calc(100svh-2rem)] w-[calc(100%-2rem)] flex-col overflow-hidden rounded-lg bg-ws-surface p-0 text-ws-text shadow-xl backdrop:bg-black/40 open:flex ${
            phase === "saved" ? "max-w-sm" : "max-w-[560px]"
          }`}
        >
          {phase === "saved" ? (
            <div className="flex items-center justify-between gap-4 p-4">
              <h2 id={headingId} className="sr-only">
                Pembaruan kondisi tersimpan
              </h2>
              <p role="status" className="text-sm text-ws-success">
                Pembaruan kondisi tersimpan di riwayat unit.
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
              className="flex min-h-0 flex-1 flex-col"
            >
              <header className="shrink-0 border-b border-ws-divider px-5 py-4 sm:px-6">
                <div className="flex items-center justify-between gap-3">
                  <h2
                    id={headingId}
                    className="text-sm font-medium text-ws-strong"
                  >
                    Perbarui kondisi
                  </h2>
                  <button
                    type="button"
                    onClick={close}
                    disabled={pending || phase === "retry"}
                    aria-label="Tutup pembaruan kondisi"
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
                <p className="text-sm leading-6">
                  Gunakan saat kerusakan ditemukan setelah pengembalian yang
                  dicatat dalam kondisi Baik. Pembaruan tersimpan sebagai
                  aktivitas baru dan unit menjadi Belum siap.
                </p>

                <fieldset
                  disabled={locked}
                  className="min-w-0 space-y-5 disabled:opacity-70"
                >
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
                      defaultValue=""
                      aria-invalid={Boolean(validation.errors[conditionId])}
                      aria-describedby={
                        validation.errors[conditionId]
                          ? `${conditionId}-error`
                          : undefined
                      }
                      className={inputClass}
                    >
                      <option value="">Pilih kondisi unit</option>
                      <option value="MINOR_DAMAGE">Rusak ringan</option>
                      <option value="DAMAGED">Rusak</option>
                      <option value="MISSING_PART">Komponen kurang</option>
                    </select>
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
                      Catatan pembaruan <span aria-hidden="true">*</span>
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
                      Jelaskan kerusakan atau komponen yang kurang. Maksimal
                      2.000 karakter.
                    </p>
                    <FieldError
                      id={`${notesId}-error`}
                      message={validation.errors[notesId]}
                    />
                  </div>

                  <UnitPhotoField
                    index={0}
                    purpose="condition"
                    required={false}
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
                        : "Simpan kondisi"}
                  </button>
                )}
              </footer>
            </form>
          )}
        </dialog>
      ) : null}
    </>
  );
}
