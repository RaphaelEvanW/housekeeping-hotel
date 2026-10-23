"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useRef, useState, type SubmitEvent } from "react";
import { createPortal } from "react-dom";

import { FieldError } from "@/components/field-error";
import { ItemNameDisclosure } from "@/components/item-name-disclosure";
import { WorkspaceControlIcon } from "@/components/workspace-control-icon";
import { confirmedDeactivationRequest } from "@/lib/item-deactivation-view";
import { useInventoryForm } from "@/lib/use-inventory-form";

const primaryClass =
  "inline-flex min-h-11 items-center justify-center rounded-md bg-ws-primary px-4 text-sm font-medium tracking-[0.01em] text-white hover:bg-ws-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ws-primary disabled:cursor-wait disabled:opacity-60";

type Outcome = "editing" | "success" | "unknown" | "blocked";

export function RequestItemDeactivationDialog({
  item,
  actorId,
}: {
  item: { id: string; name: string };
  actorId: string;
}) {
  const router = useRouter();
  const validation = useInventoryForm();
  const dialog = useRef<HTMLDialogElement>(null);
  const reasonInput = useRef<HTMLTextAreaElement>(null);
  const inFlight = useRef(false);

  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>("editing");
  const [error, setError] = useState("");
  const [expired, setExpired] = useState(false);

  const prefix = `deactivation-${item.id}`;
  const reasonId = `${prefix}-reason`;
  const locked = outcome !== "editing";

  useEffect(() => {
    if (!open) return;

    const element = dialog.current!;
    const previousOverflow = document.body.style.overflow;
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    element.showModal();
    document.body.style.overflow = "hidden";

    if (!locked) reasonInput.current?.focus();

    return () => {
      element.close();
      document.body.style.overflow = previousOverflow;

      if (previousFocus?.isConnected) {
        previousFocus.focus({ preventScroll: true });
      }
    };
  }, [open, locked]);

  function begin() {
    if (outcome === "editing") {
      validation.reset();
      setError("");
      setExpired(false);
    }

    setOpen(true);
  }

  function close() {
    if (!inFlight.current) setOpen(false);
  }

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    if (inFlight.current || locked) return;
    if (!validation.validate(event.currentTarget)) return;

    const reason = String(
      new FormData(event.currentTarget).get("reason") ?? "",
    ).trim();

    inFlight.current = true;
    setPending(true);
    setError("");
    setExpired(false);

    try {
      const response = await fetch(
        `/api/items/${encodeURIComponent(item.id)}/deactivation-requests`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason }),
        },
      );

      const body: unknown = await response.json().catch(() => null);

      if (response.status === 201) {
        if (!confirmedDeactivationRequest(body, item.id, actorId, reason)) {
          throw new Error("Unconfirmed submission");
        }

        setOutcome("success");
        router.refresh();
        return;
      }

      if (response.status === 409) {
        const code =
          body && typeof body === "object" && "error" in body
            ? body.error
            : null;

        setOutcome("blocked");
        setError(
          code === "PENDING_REQUEST_EXISTS"
            ? "Jenis barang ini sudah memiliki pengajuan yang menunggu keputusan Supervisor."
            : code === "ITEM_INACTIVE"
              ? "Jenis barang ini sudah nonaktif. Muat ulang data."
              : "Pengajuan tidak dapat diproses karena data sudah berubah. Muat ulang data.",
        );

        router.refresh();
        return;
      }

      if ([400, 401, 403, 404, 413, 415].includes(response.status)) {
        setExpired(response.status === 401);

        if (response.status === 403 || response.status === 404) {
          setOutcome("blocked");
        }

        setError(
          response.status === 401
            ? "Sesi Anda berakhir. Masuk kembali untuk melanjutkan."
            : response.status === 403
              ? "Anda tidak memiliki izin mengajukan penonaktifan."
              : response.status === 404
                ? "Jenis barang tidak ditemukan. Muat ulang data."
                : "Periksa alasan pengajuan. Gunakan 1–1000 karakter.",
        );

        if (response.status === 400) reasonInput.current?.focus();
        return;
      }

      throw new Error("Unconfirmed submission");
    } catch {
      setOutcome("unknown");
      setError(
        "Hasil pengajuan belum dapat dipastikan. Jangan kirim ulang sebelum memeriksa pengajuan yang tersimpan.",
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
        className="inline-flex min-h-11 max-w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-ws-danger bg-ws-danger px-3 text-sm leading-5 font-medium tracking-[0.01em] text-white transition-colors duration-150 hover:bg-ws-danger/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ws-danger motion-reduce:transition-none"
      >
        <WorkspaceControlIcon name="prohibit" />
        Ajukan penonaktifan
      </button>

      {open
        ? createPortal(
            <dialog
              ref={dialog}
              aria-labelledby={`${prefix}-heading`}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                if (event.key === "Escape") event.stopPropagation();
              }}
              onCancel={(event) => {
                event.stopPropagation();

                if (inFlight.current) event.preventDefault();
                else setOpen(false);
              }}
              className="fixed inset-0 m-auto max-h-[calc(100svh-24px)] w-[calc(100%-24px)] max-w-lg overflow-y-auto overscroll-contain rounded-lg border-0 bg-ws-surface p-5 font-workspace text-ws-text shadow-xl backdrop:bg-black/35 [color-scheme:light] sm:p-6"
            >
              <header>
                <div className="flex items-center justify-between gap-4 border-b border-ws-divider pb-4">
                  <h2
                    id={`${prefix}-heading`}
                    className="text-sm font-medium text-ws-strong"
                  >
                    Pengajuan penonaktifan
                  </h2>

                  <button
                    type="button"
                    aria-label="Tutup pengajuan penonaktifan"
                    disabled={pending}
                    onClick={close}
                    className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-ws-strong hover:bg-ws-inset focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ws-primary disabled:cursor-wait disabled:opacity-60"
                  >
                    <WorkspaceControlIcon name="close" />
                  </button>
                </div>

                <div className="pt-4">
                  <ItemNameDisclosure id={`${prefix}-item`} name={item.name} />
                </div>
              </header>

              {outcome === "success" ? (
                <div className="mt-5">
                  <p
                    role="status"
                    className="text-sm font-medium leading-6 text-ws-success"
                  >
                    Pengajuan berhasil dikirim.
                  </p>

                  <p className="mt-2 text-sm leading-6">
                    Menunggu keputusan Supervisor. Jenis barang masih aktif.
                  </p>

                  <div className="mt-6 flex flex-wrap justify-end gap-3">
                    <Link
                      href={`/inventory/deactivation-requests?${new URLSearchParams({ itemId: item.id, status: "PENDING" })}`}
                      className="ws-button-secondary"
                    >
                      Lihat pengajuan
                    </Link>
                    <button
                      type="button"
                      onClick={close}
                      className={primaryClass}
                    >
                      Selesai
                    </button>
                  </div>
                </div>
              ) : (
                <form
                  noValidate
                  onSubmit={submit}
                  onInput={validation.onInput}
                  aria-busy={pending}
                  className="mt-5"
                >
                  <p className="text-sm leading-6">
                    Pengajuan ini berlaku untuk jenis barang. Penonaktifan
                    dilakukan setelah disetujui Supervisor.
                  </p>

                  <label
                    htmlFor={reasonId}
                    className="mt-5 block text-sm font-medium text-ws-strong"
                  >
                    Alasan penonaktifan <span aria-hidden="true">*</span>
                  </label>

                  <textarea
                    ref={reasonInput}
                    id={reasonId}
                    name="reason"
                    required
                    maxLength={1000}
                    rows={4}
                    disabled={pending || locked}
                    aria-invalid={
                      Boolean(validation.errors[reasonId]) || undefined
                    }
                    aria-describedby={
                      validation.errors[reasonId]
                        ? `${reasonId}-error`
                        : `${reasonId}-hint`
                    }
                    className="mt-2 w-full min-w-0 resize-none rounded-md border border-ws-control bg-ws-inset px-3 py-3 text-sm leading-6 text-ws-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ws-primary disabled:opacity-60"
                  />

                  <p id={`${reasonId}-hint`} className="mt-2 text-xs leading-5">
                    Maksimal 1000 karakter.
                  </p>

                  <FieldError
                    id={`${reasonId}-error`}
                    message={validation.errors[reasonId]}
                  />

                  {error ? (
                    <p
                      role="alert"
                      className="mt-4 text-sm leading-6 text-ws-danger"
                    >
                      {error}
                    </p>
                  ) : null}

                  {locked ? (
                    <Link
                      href={`/inventory/deactivation-requests?${new URLSearchParams({ itemId: item.id, status: "ALL" })}`}
                      className="ws-button-secondary mt-3"
                    >
                      Periksa pengajuan tersimpan
                    </Link>
                  ) : null}

                  {expired ? (
                    <a
                      href="/login"
                      className="mt-3 inline-flex min-h-11 items-center text-sm text-ws-primary underline"
                    >
                      Ke halaman masuk
                    </a>
                  ) : null}

                  <div className="mt-6 flex flex-wrap justify-end gap-3">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={close}
                      className="ws-button-secondary"
                    >
                      {locked ? "Tutup" : "Batal"}
                    </button>

                    {locked ? (
                      <button
                        type="button"
                        onClick={() => window.location.reload()}
                        className="ws-button-secondary"
                      >
                        Muat ulang data
                      </button>
                    ) : (
                      <button
                        type="submit"
                        disabled={pending || expired}
                        className={primaryClass}
                      >
                        {pending ? "Mengirim…" : "Kirim pengajuan"}
                      </button>
                    )}
                  </div>
                </form>
              )}
            </dialog>,
            document.body,
          )
        : null}
    </>
  );
}
