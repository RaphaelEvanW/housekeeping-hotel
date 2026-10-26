"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type SubmitEvent } from "react";
import { z } from "zod";
import { FieldError } from "@/components/field-error";
import { WorkspaceControlIcon } from "@/components/workspace-control-icon";
import { guestVisitIdSchema, registerGuestVisitInputSchema } from "@/server/guest-visit-input";

const primaryClass = "inline-flex min-h-11 items-center justify-center rounded-md border border-ws-primary bg-ws-primary px-4 text-sm leading-5 font-medium text-white transition-colors hover:border-ws-primary-hover hover:bg-ws-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ws-primary disabled:cursor-wait disabled:opacity-60";
const inputClass = "mt-2 min-h-11 w-full min-w-0 rounded-md border border-ws-control bg-ws-inset px-3 text-sm text-ws-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ws-primary disabled:opacity-60";
const failureSchema = z.object({
  error: z.string().optional(),
  message: z.string().optional(),
  matchingVisitId: z.string().uuid().optional(),
  issues: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
});
const successSchema = z.object({
  visit: z.object({ id: guestVisitIdSchema, primaryGuestName: z.string() }),
  replayed: z.boolean(),
});
type Registration = z.infer<typeof registerGuestVisitInputSchema>;
type Attempt = { payload: Registration; requestId: string };

export function RegisterGuestDialog() {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const attempt = useRef<Attempt | null>(null);
  const submitting = useRef(false);
  const previousOverflow = useRef("");
  const [pending, setPending] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [duplicate, setDuplicate] = useState(false);
  const [matchingVisitId, setMatchingVisitId] = useState("");
  const locked = pending || uncertain;

  useEffect(() => {
    if (!uncertain && !pending) return;
    const warnBeforeLeave = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warnBeforeLeave);
    return () => window.removeEventListener("beforeunload", warnBeforeLeave);
  }, [pending, uncertain]);

  useEffect(() => () => {
    if (dialog.current?.open) dialog.current.close();
    document.body.style.overflow = previousOverflow.current;
  }, []);

  function showDialog() {
    setError("");
    setFieldErrors({});
    setDuplicate(false);
    setMatchingVisitId("");
    attempt.current = null;
    formRef.current?.reset();
    previousOverflow.current = document.body.style.overflow;
    dialog.current?.showModal();
    document.body.style.overflow = "hidden";
  }

  function closeDialog() {
    if (locked) return;
    dialog.current?.close();
    document.body.style.overflow = previousOverflow.current;
  }

  function clearFieldError(event: FormEvent<HTMLFormElement>) {
    const field = event.target;
    if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
      setError("");
      setFieldErrors((previous) => {
        if (!previous[field.name]) return previous;
        const next = { ...previous };
        delete next[field.name];
        return next;
      });
      if (["primaryGuestName", "roomNumber", "checkInDate", "plannedCheckoutDate"].includes(field.name)) {
        setDuplicate(false);
        setMatchingVisitId("");
      }
    }
  }

  async function send(attemptToSend: Attempt) {
    if (submitting.current) return;
    submitting.current = true;
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/guest-visits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(attemptToSend.payload),
      });
      const body: unknown = await response.json().catch(() => null);
      if (response.status === 200 || response.status === 201) {
        const success = successSchema.safeParse(body);
        if (!success.success || success.data.visit.id !== attemptToSend.requestId) {
          setUncertain(true);
          setError("Respons penyimpanan belum dapat dipastikan. Periksa penyimpanan dengan mencoba lagi.");
          return;
        }
        const query = new URLSearchParams({ q: success.data.visit.primaryGuestName, status: "ALL", page: "1" });
        attempt.current = null;
        dialog.current?.close();
        document.body.style.overflow = previousOverflow.current;
        router.replace(`/guests?${query}`);
        router.refresh();
        return;
      }

      const failure = failureSchema.safeParse(body);
      if (!failure.success || response.status >= 500) {
        setUncertain(true);
        setError("Hasil penyimpanan belum dapat dipastikan. Jangan tutup halaman; coba periksa penyimpanan lagi.");
        return;
      }
      const data = failure.data;
      if (response.status === 409 && data.error === "POSSIBLE_DUPLICATE") {
        attempt.current = null;
        setDuplicate(true);
        setMatchingVisitId(data.matchingVisitId ?? "");
        setError(data.message ?? "Ada kunjungan aktif yang mungkin sama. Periksa data atau isi alasan untuk melanjutkan.");
        return;
      }
      if (response.status === 400 && data.error === "INVALID_INPUT" && data.issues) {
        const nextErrors: Record<string, string> = {};
        for (const issue of data.issues) nextErrors[issue.path] = issue.message;
        setFieldErrors(nextErrors);
        setError(data.message ?? "Periksa kembali data kunjungan.");
        return;
      }
      attempt.current = null;
      setError(response.status === 401
        ? "Sesi Anda berakhir. Masuk kembali untuk melanjutkan."
        : response.status === 403
          ? "Akun Anda tidak memiliki izin untuk mendaftarkan tamu."
          : data.message ?? "Data kunjungan belum dapat disimpan.");
    } catch {
      setUncertain(true);
      setError("Koneksi terputus sebelum hasil penyimpanan diterima. Coba periksa penyimpanan lagi.");
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    if (uncertain && attempt.current) {
      await send(attempt.current);
      return;
    }
    const form = event.currentTarget;
    const data = new FormData(form);
    const payload = {
      requestId: crypto.randomUUID(),
      primaryGuestName: String(data.get("primaryGuestName") ?? ""),
      roomNumber: String(data.get("roomNumber") ?? ""),
      bookingNumber: String(data.get("bookingNumber") ?? ""),
      checkInDate: String(data.get("checkInDate") ?? ""),
      plannedCheckoutDate: String(data.get("plannedCheckoutDate") ?? ""),
      ...(duplicate ? { duplicateOverrideReason: String(data.get("duplicateOverrideReason") ?? "") } : {}),
    };
    const parsed = registerGuestVisitInputSchema.safeParse(payload);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      const requiredMessages: Record<string, string> = {
        primaryGuestName: "Nama tamu utama wajib diisi.",
        roomNumber: "Nomor kamar wajib diisi.",
        bookingNumber: "Nomor booking wajib diisi.",
        checkInDate: "Tanggal check-in wajib diisi.",
        plannedCheckoutDate: "Rencana tanggal checkout wajib diisi.",
        duplicateOverrideReason: "Alasan wajib diisi untuk melanjutkan registrasi duplikat.",
      };
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "");
        if (key) next[key] = requiredMessages[key] && issue.code === "too_small" ? requiredMessages[key] : issue.message;
      }
      setFieldErrors(next);
      setError("Lengkapi field wajib dan periksa kembali tanggal kunjungan.");
      requestAnimationFrame(() => form.querySelector<HTMLElement>("[aria-invalid='true']")?.focus());
      return;
    }
    const request = { payload: parsed.data, requestId: parsed.data.requestId };
    attempt.current = request;
    await send(request);
  }

  return (
    <>
      <button type="button" onClick={showDialog} aria-haspopup="dialog" className={primaryClass}>Daftarkan tamu</button>
      <dialog
        ref={dialog}
        aria-labelledby="register-guest-title"
        onCancel={(event) => { if (locked) event.preventDefault(); else { document.body.style.overflow = previousOverflow.current; } }}
        onClick={(event) => { if (event.target === event.currentTarget) closeDialog(); }}
        className="m-auto max-h-[min(90svh,760px)] w-[min(100%-1rem,560px)] overflow-y-auto rounded-xl bg-ws-surface p-0 text-ws-strong shadow-2xl backdrop:bg-black/40"
      >
        <div className="flex items-center justify-between gap-4 border-b border-ws-divider px-6 py-4">
          <div>
            <p className="text-xs text-ws-text">Kunjungan baru</p>
            <h2 id="register-guest-title" className="mt-1 font-heading text-xl font-semibold">Daftarkan tamu</h2>
          </div>
          <button type="button" onClick={closeDialog} disabled={locked} aria-label="Tutup" title="Tutup" className="ws-button-secondary size-10 shrink-0 p-0"><WorkspaceControlIcon name="close" /></button>
        </div>
        <form ref={formRef} noValidate onInput={clearFieldError} onSubmit={submit} className="space-y-4 p-6">
          <p className="text-sm leading-6">Gunakan form ini saat tamu akan meminjam barang.</p>
          {([
            ["primaryGuestName", "Nama tamu utama", "text", 200],
            ["roomNumber", "Nomor kamar", "text", 30],
            ["bookingNumber", "Nomor booking", "text", 100],
            ["checkInDate", "Tanggal check-in", "date", undefined],
            ["plannedCheckoutDate", "Rencana tanggal checkout", "date", undefined],
          ] as const).map(([name, label, type, maxLength]) => (
            <label key={name} htmlFor={`guest-${name}`} className="block text-sm font-medium text-ws-strong">
              {label} <span aria-hidden="true" className="text-ws-danger">*</span>
              <input
                id={`guest-${name}`}
                name={name}
                type={type}
                required
                maxLength={maxLength}
                autoComplete="off"
                disabled={locked}
                aria-invalid={Boolean(fieldErrors[name])}
                aria-describedby={fieldErrors[name] ? `guest-${name}-error` : undefined}
                className={inputClass}
              />
              <FieldError id={`guest-${name}-error`} message={fieldErrors[name]} />
            </label>
          ))}
          {duplicate ? (
            <div>
              <label htmlFor="duplicateOverrideReason" className="block text-sm font-medium text-ws-strong">
                Alasan melanjutkan registrasi duplikat <span aria-hidden="true" className="text-ws-danger">*</span>
                <textarea id="duplicateOverrideReason" name="duplicateOverrideReason" required maxLength={2000} disabled={locked} aria-invalid={Boolean(fieldErrors.duplicateOverrideReason)} aria-describedby={fieldErrors.duplicateOverrideReason ? "duplicateOverrideReason-error" : undefined} className={`${inputClass} min-h-24 py-3`} />
                <FieldError id="duplicateOverrideReason-error" message={fieldErrors.duplicateOverrideReason} />
              </label>
              {matchingVisitId ? <Link href="/guests?status=STAYING" className="mt-2 inline-flex min-h-11 items-center text-xs text-ws-primary underline underline-offset-4">Lihat daftar kunjungan yang menginap</Link> : null}
            </div>
          ) : null}
          {error ? <p role="alert" className="rounded-md bg-ws-danger/5 p-3 text-sm leading-6 text-ws-danger">{error}</p> : null}
          {uncertain ? <p className="text-xs leading-5 text-ws-text">Data dikunci agar pemeriksaan memakai permintaan yang sama.</p> : null}
          <div className="flex flex-wrap justify-end gap-2 border-t border-ws-divider pt-4">
            <button type="button" onClick={closeDialog} disabled={locked} className="ws-button-secondary">Batal</button>
            <button type="submit" disabled={pending} className={primaryClass}>{pending ? "Menyimpan…" : uncertain ? "Periksa penyimpanan" : duplicate ? "Lanjutkan registrasi" : "Simpan kunjungan"}</button>
          </div>
        </form>
      </dialog>
    </>
  );
}
