"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type SubmitEvent,
} from "react";
import { z } from "zod";
import { FieldError } from "@/components/field-error";
import { WorkspaceControlIcon } from "@/components/workspace-control-icon";
import { useInventoryForm } from "@/lib/use-inventory-form";
import {
  guestVisitIdSchema,
  updateGuestVisitInputSchema,
} from "@/server/guest-visit-input";

type VisitIdentity = {
  id: string;
  primaryGuestName: string;
  roomNumber: string;
  updatedAt: string;
};

type UpdatePayload = z.infer<typeof updateGuestVisitInputSchema>;

const successSchema = z.object({
  visit: z.object({
    id: guestVisitIdSchema,
    primaryGuestName: z.string().min(1),
    roomNumber: z.string().min(1),
    updatedAt: z.iso.datetime(),
  }),
  unchanged: z.boolean(),
});

const failureSchema = z.object({
  error: z.string(),
  message: z.string().optional(),
  matchingVisitId: guestVisitIdSchema.optional(),
});

const inputClass =
  "mt-2 min-h-11 w-full min-w-0 rounded-md border border-ws-control bg-ws-inset px-3 text-sm text-ws-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ws-primary disabled:cursor-not-allowed disabled:opacity-60";

export function EditGuestDialog({ visit }: { visit: VisitIdentity }) {
  const router = useRouter();
  const validation = useInventoryForm();
  const dialog = useRef<HTMLDialogElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const successClose = useRef<HTMLButtonElement>(null);
  const inFlight = useRef(false);
  const [open, setOpen] = useState(false);
  const [baseline, setBaseline] = useState(visit);
  const [attempted, setAttempted] = useState<UpdatePayload | null>(null);
  const [pending, setPending] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [duplicate, setDuplicate] = useState(false);
  const [matchingVisitId, setMatchingVisitId] = useState("");
  const [expired, setExpired] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [formRevision, setFormRevision] = useState(0);
  const locked = pending || blocked;

  useEffect(() => {
    if (!open) return;
    const element = dialog.current;
    if (!element) return;
    const previousOverflow = document.body.style.overflow;
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    element.showModal();
    document.body.style.overflow = "hidden";
    nameInput.current?.focus({ preventScroll: true });
    return () => {
      element.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected)
        previousFocus.focus({ preventScroll: true });
    };
  }, [open]);

  useEffect(() => {
    if (success) successClose.current?.focus({ preventScroll: true });
  }, [success]);

  function begin() {
    if (!blocked) {
      setBaseline(visit);
      setAttempted(null);
      setDuplicate(false);
      setMatchingVisitId("");
      setExpired(false);
      setError("");
      setSuccess("");
      validation.reset();
      setFormRevision((revision) => revision + 1);
    }
    setOpen(true);
  }

  function close() {
    if (inFlight.current) return;
    setOpen(false);
  }

  function handleInput(event: FormEvent<HTMLFormElement>) {
    validation.onInput(event);
    setError("");
    const field = event.target;
    if (
      field instanceof HTMLInputElement &&
      (field.name === "primaryGuestName" || field.name === "roomNumber")
    ) {
      setDuplicate(false);
      setMatchingVisitId("");
    }
  }

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || blocked || duplicate) return;
    const form = event.currentTarget;
    if (!validation.validate(form)) return;

    const values = new FormData(form);
    const parsed = updateGuestVisitInputSchema.safeParse({
      expectedUpdatedAt: baseline.updatedAt,
      primaryGuestName: String(values.get("primaryGuestName") ?? ""),
      roomNumber: String(values.get("roomNumber") ?? ""),
      reason: String(values.get("reason") ?? ""),
      acknowledgeDuplicate: false,
    });
    if (!parsed.success) {
      setError("Periksa kembali nama, nomor kamar, dan alasan perubahan.");
      return;
    }

    const payload = parsed.data;
    if (
      payload.primaryGuestName === baseline.primaryGuestName &&
      payload.roomNumber === baseline.roomNumber
    ) {
      setError("Belum ada perubahan pada nama tamu atau nomor kamar.");
      return;
    }

    setAttempted(payload);
    setError("");
    setPending(true);
    inFlight.current = true;
    try {
      const response = await fetch(`/api/guest-visits/${visit.id}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body: unknown = await response.json().catch(() => null);

      if (response.ok) {
        const result = successSchema.safeParse(body);
        const savedAt = result.success
          ? Date.parse(result.data.visit.updatedAt)
          : Number.NaN;
        const baselineAt = Date.parse(baseline.updatedAt);
        if (
          !result.success ||
          result.data.visit.id !== visit.id ||
          result.data.visit.primaryGuestName !== payload.primaryGuestName ||
          result.data.visit.roomNumber !== payload.roomNumber ||
          !Number.isFinite(savedAt) ||
          savedAt < baselineAt ||
          (!result.data.unchanged && savedAt <= baselineAt)
        ) {
          setBlocked(true);
          setError(
            "Hasil penyimpanan belum dapat dipastikan. Muat ulang data sebelum mencoba lagi.",
          );
          return;
        }
        setAttempted(null);
        setSuccess(
          result.data.unchanged
            ? "Data kunjungan sudah sesuai."
            : "Data kunjungan berhasil diperbarui.",
        );
        router.refresh();
        return;
      }

      const failure = failureSchema.safeParse(body);
      if (!failure.success || response.status >= 500) {
        setBlocked(true);
        setError(
          "Hasil penyimpanan belum dapat dipastikan. Muat ulang data untuk memeriksa perubahan sebelum menyimpan kembali.",
        );
        return;
      }

      if (
        response.status === 409 &&
        failure.data.error === "POSSIBLE_DUPLICATE"
      ) {
        setAttempted(null);
        setDuplicate(true);
        setMatchingVisitId(failure.data.matchingVisitId ?? "");
        setError(
          "Kunjungan lain dengan nama, kamar, dan tanggal yang bertumpang tindih ditemukan. Periksa kunjungan tersebut sebelum menyimpan perubahan.",
        );
        return;
      }

      if (
        response.status === 409 &&
        failure.data.error === "VISIT_CHANGED"
      ) {
        setBlocked(true);
        setError(
          "Data kunjungan berubah sejak form dibuka. Muat ulang data sebelum membuat perubahan baru.",
        );
        return;
      }

      if ([401, 403, 404].includes(response.status)) {
        setBlocked(true);
        setExpired(response.status === 401);
        setError(
          response.status === 401
            ? "Sesi Anda berakhir. Muat ulang halaman untuk masuk kembali."
            : response.status === 403
              ? "Akun Anda tidak memiliki izin untuk mengubah data kunjungan ini."
              : "Kunjungan tidak lagi tersedia. Muat ulang halaman untuk melihat data terbaru.",
        );
        return;
      }

      setAttempted(null);
      setError(
        failure.data.message ??
          "Data belum dapat disimpan. Periksa kembali isian Anda.",
      );
    } catch {
      setBlocked(true);
      setError(
        "Hasil penyimpanan belum dapat dipastikan. Muat ulang data untuk memeriksa perubahan sebelum menyimpan kembali.",
      );
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={begin}
        aria-haspopup="dialog"
        className="ws-button-secondary shrink-0"
      >
        <WorkspaceControlIcon name="pencil" />
        Edit data
      </button>
      {open ? (
        <dialog
          ref={dialog}
          aria-labelledby="edit-guest-title"
          onCancel={(event) => {
            if (inFlight.current) event.preventDefault();
            else close();
          }}
          onClick={(event) => {
            if (event.target !== event.currentTarget) return;
            const rect = event.currentTarget.getBoundingClientRect();
            if (
              event.clientX < rect.left ||
              event.clientX > rect.right ||
              event.clientY < rect.top ||
              event.clientY > rect.bottom
            )
              close();
          }}
          className={`m-auto max-h-[calc(100svh-2rem)] w-[calc(100%-2rem)] flex-col overflow-hidden rounded-lg bg-ws-surface p-0 text-ws-strong shadow-xl backdrop:bg-black/40 open:flex ${success ? "max-w-md" : "max-w-2xl"}`}
        >
          {success ? (
            <div className="flex items-start justify-between gap-4 p-5">
              <div>
                <h2 id="edit-guest-title" className="font-semibold">
                  Data kunjungan
                </h2>
                <p role="status" className="mt-2 text-sm text-ws-success">
                  {success}
                </p>
              </div>
              <button
                ref={successClose}
                type="button"
                onClick={close}
                aria-label="Tutup"
                title="Tutup"
                className="ws-button-secondary size-10 shrink-0 p-0"
              >
                <WorkspaceControlIcon name="close" />
              </button>
            </div>
          ) : (
            <>
              <header className="shrink-0 border-b border-ws-divider px-6 py-4">
                <div className="flex items-center justify-between gap-4">
                  <h2 id="edit-guest-title" className="font-heading text-lg font-semibold">
                    Edit data tamu
                  </h2>
                  <button
                    type="button"
                    onClick={close}
                    disabled={pending}
                    aria-label="Tutup"
                    title="Tutup"
                    className="ws-button-secondary size-10 shrink-0 p-0"
                  >
                    <WorkspaceControlIcon name="close" />
                  </button>
                </div>
                <div className="mt-3 border-t border-ws-divider pt-3">
                  <p className="break-words text-sm font-medium text-ws-strong">
                    {baseline.primaryGuestName}
                  </p>
                  <p className="mt-1 text-xs text-ws-text">
                    Kamar {baseline.roomNumber}
                  </p>
                </div>
              </header>
              <form
                key={`${baseline.updatedAt}-${formRevision}`}
                noValidate
                aria-busy={pending}
                onSubmit={submit}
                onInput={handleInput}
                className="flex min-h-0 flex-1 flex-col"
              >
                <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-6">
                  <p className="text-sm leading-6 text-ws-text">
                    Perubahan berlaku pada data kunjungan. Riwayat peminjaman
                    tetap mencatat nama dan kamar saat barang dipinjam.
                  </p>
                  <fieldset disabled={locked} className="space-y-5">
                    <div>
                      <label htmlFor="edit-guest-name" className="text-sm font-medium">
                        Nama tamu utama <span aria-hidden="true">*</span>
                      </label>
                      <input
                        ref={nameInput}
                        id="edit-guest-name"
                        name="primaryGuestName"
                        type="text"
                        autoComplete="off"
                        required
                        maxLength={200}
                        defaultValue={attempted?.primaryGuestName ?? baseline.primaryGuestName}
                        aria-invalid={Boolean(validation.errors["edit-guest-name"])}
                        aria-describedby={validation.errors["edit-guest-name"] ? "edit-guest-name-error" : undefined}
                        className={inputClass}
                      />
                      <FieldError id="edit-guest-name-error" message={validation.errors["edit-guest-name"]} />
                    </div>
                    <div>
                      <label htmlFor="edit-guest-room" className="text-sm font-medium">
                        Nomor kamar <span aria-hidden="true">*</span>
                      </label>
                      <input
                        id="edit-guest-room"
                        name="roomNumber"
                        type="text"
                        autoComplete="off"
                        required
                        maxLength={30}
                        defaultValue={attempted?.roomNumber ?? baseline.roomNumber}
                        aria-invalid={Boolean(validation.errors["edit-guest-room"])}
                        aria-describedby={validation.errors["edit-guest-room"] ? "edit-guest-room-error" : undefined}
                        className={inputClass}
                      />
                      <FieldError id="edit-guest-room-error" message={validation.errors["edit-guest-room"]} />
                    </div>
                    <div>
                      <label htmlFor="edit-guest-reason" className="text-sm font-medium">
                        Alasan perubahan <span aria-hidden="true">*</span>
                      </label>
                      <textarea
                        id="edit-guest-reason"
                        name="reason"
                        required
                        maxLength={2000}
                        rows={4}
                        defaultValue={attempted?.reason ?? ""}
                        aria-invalid={Boolean(validation.errors["edit-guest-reason"])}
                        aria-describedby={
                          validation.errors["edit-guest-reason"]
                            ? "edit-guest-reason-help edit-guest-reason-error"
                            : "edit-guest-reason-help"
                        }
                        className={`${inputClass} resize-none py-3`}
                      />
                      <p id="edit-guest-reason-help" className="mt-2 text-xs leading-5 text-ws-text">
                        Dicatat pada riwayat perubahan. Maksimal 2.000 karakter.
                      </p>
                      <FieldError id="edit-guest-reason-error" message={validation.errors["edit-guest-reason"]} />
                    </div>
                  </fieldset>
                  {error ? <p role="alert" className="text-sm leading-6 text-ws-danger">{error}</p> : null}
                  {duplicate && matchingVisitId ? (
                    <Link
                      href={`/guests/${matchingVisitId}`}
                      prefetch={false}
                      onClick={close}
                      className="ws-button-secondary w-full justify-between"
                    >
                      Buka kunjungan yang sesuai
                      <WorkspaceControlIcon name="caretRight" />
                    </Link>
                  ) : null}
                  {expired ? (
                    <Link href="/login" className="ws-button-secondary w-full justify-center">
                      Masuk kembali
                    </Link>
                  ) : null}
                </div>
                <footer className="flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-ws-divider p-4 md:px-6">
                  <button
                    type="button"
                    onClick={close}
                    disabled={pending}
                    className="ws-button-secondary"
                  >
                    {blocked ? "Tutup" : "Batal"}
                  </button>
                  {blocked ? (
                    <button
                      type="button"
                      onClick={() => window.location.reload()}
                      className="inline-flex min-h-11 items-center justify-center rounded-md border border-ws-primary bg-ws-primary px-4 text-sm font-medium text-white hover:bg-ws-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ws-primary"
                    >
                      Muat ulang data
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={pending || duplicate}
                      className="inline-flex min-h-11 items-center justify-center rounded-md border border-ws-primary bg-ws-primary px-4 text-sm font-medium text-white hover:bg-ws-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ws-primary disabled:cursor-wait disabled:opacity-60"
                    >
                      {pending ? "Menyimpan…" : "Simpan perubahan"}
                    </button>
                  )}
                </footer>
              </form>
            </>
          )}
        </dialog>
      ) : null}
    </>
  );
}
