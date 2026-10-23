"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type SubmitEvent } from "react";
import { createPortal } from "react-dom";
import { WorkspaceControlIcon } from "@/components/workspace-control-icon";
import { FieldError } from "@/components/field-error";
import { useInventoryForm } from "@/lib/use-inventory-form";

const actionClass =
  "inline-flex min-h-11 items-center justify-center rounded-md bg-ws-primary px-4 text-sm leading-5 font-medium tracking-[0.01em] text-white hover:bg-ws-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ws-primary disabled:cursor-wait disabled:opacity-60";

export function EditItemDialog({
  item,
}: {
  item: { id: string; name: string; description: string | null };
}) {
  const router = useRouter();
  const validation = useInventoryForm();
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const successClose = useRef<HTMLButtonElement>(null);
  const inFlight = useRef(false);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [expired, setExpired] = useState(false);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (success) successClose.current?.focus({ preventScroll: true });
  }, [success]);

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
    input.current?.select();
    return () => {
      element.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected)
        previousFocus.focus({ preventScroll: true });
    };
  }, [open]);

  function begin() {
    validation.reset();
    setError("");
    setInvalid(false);
    setExpired(false);
    setUnconfirmed(false);
    setSuccess(false);
    setOpen(true);
  }

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    if (inFlight.current || unconfirmed || success) return;
    if (!validation.validate(event.currentTarget)) return;

    const values = new FormData(event.currentTarget);
    const name = String(values.get("name") ?? "")
      .trim()
      .replace(/\s+/gu, " ");
    const description = String(values.get("description") ?? "").trim();

    setError("");
    setInvalid(false);
    setExpired(false);
    if (!name || name.length > 100) {
      setError(
        !name
          ? "Nama jenis barang wajib diisi."
          : "Nama jenis barang maksimal 100 karakter.",
      );
      setInvalid(true);
      input.current?.focus();
      return;
    }
    if (description.length > 2000) {
      setError("Deskripsi maksimal 2000 karakter.");
      return;
    }
    inFlight.current = true;
    setPending(true);
    try {
      const response = await fetch(`/api/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (response.status === 200) {
        if (
          !body ||
          typeof body !== "object" ||
          !("item" in body) ||
          !body.item ||
          typeof body.item !== "object" ||
          !("id" in body.item) ||
          body.item.id !== item.id ||
          !("name" in body.item) ||
          body.item.name !== name ||
          !("description" in body.item) ||
          body.item.description !== (description || null)
        )
          throw new Error("Unconfirmed item update");
        setSuccess(true);
        router.refresh();
      } else if (
        [400, 401, 403, 404, 409, 413, 415].includes(response.status)
      ) {
        setExpired(response.status === 401);
        setInvalid(response.status === 409);
        setError(
          response.status === 409
            ? "Nama jenis barang sudah digunakan. Gunakan nama lain."
            : response.status === 401
              ? "Sesi Anda berakhir. Masuk kembali untuk melanjutkan."
              : response.status === 403
                ? "Anda tidak memiliki izin mengubah jenis barang."
                : response.status === 404
                  ? "Jenis barang tidak ditemukan. Muat ulang daftar barang."
                  : "Periksa detail jenis barang sebelum menyimpan kembali.",
        );
        if (response.status === 400 || response.status === 409)
          input.current?.focus();
      } else throw new Error("Unconfirmed item update");
    } catch {
      setUnconfirmed(true);
      setError(
        "Hasil perubahan belum dapat dipastikan. Muat ulang data untuk memeriksa detail terbaru sebelum mengubahnya lagi.",
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
        aria-label="Edit jenis barang"
        aria-haspopup="dialog"
        className="ws-button-secondary min-w-0"
      >
        <WorkspaceControlIcon name="pencil" />
        <span>Edit</span>
      </button>
      {open
        ? createPortal(
            <dialog
              ref={dialog}
              aria-labelledby="edit-item-heading"
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                if (event.key === "Escape") event.stopPropagation();
              }}
              onCancel={(event) => {
                event.stopPropagation();
                if (inFlight.current) event.preventDefault();
                else setOpen(false);
              }}
              className={`fixed inset-0 m-auto max-h-[calc(100svh-32px)] w-[calc(100%-32px)] overflow-y-auto overscroll-contain rounded-lg border-0 bg-ws-surface font-workspace text-ws-text shadow-xl backdrop:bg-black/35 [color-scheme:light] ${success ? "max-w-sm p-4" : "max-w-md p-6 sm:p-8"}`}
            >
              <h2
                id="edit-item-heading"
                className={success ? "sr-only" : "font-heading text-xl leading-7 font-semibold text-ws-strong"}
              >
                Edit
              </h2>
              {success ? (
                <div className="flex items-center justify-between gap-3">
                  <p
                    role="status"
                    className="text-sm leading-5 text-ws-success"
                  >
                    Jenis barang berhasil diperbarui.
                  </p>
                  <button
                    ref={successClose}
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label="Tutup konfirmasi"
                    title="Tutup"
                    className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-ws-strong hover:bg-ws-inset focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ws-primary"
                  >
                    <WorkspaceControlIcon name="close" />
                  </button>
                </div>
              ) : (
                <form onSubmit={submit} noValidate onInput={validation.onInput} aria-busy={pending} className="mt-5">
                  <label
                    htmlFor="edit-item-name"
                    className="block text-sm font-medium text-ws-strong"
                  >
                    Nama jenis barang <span aria-hidden="true">*</span>
                  </label>
                  <input
                    ref={input}
                    id="edit-item-name"
                    name="name"
                    defaultValue={item.name}
                    required
                    maxLength={100}
                    disabled={pending || unconfirmed}
                    aria-invalid={invalid || Boolean(validation.errors["edit-item-name"]) || undefined}
                    aria-describedby={validation.errors["edit-item-name"] ? "edit-item-name-error" : error ? "edit-item-error" : undefined}
                    className="mt-2 min-h-11 w-full min-w-0 rounded-md border border-ws-control bg-ws-inset px-3 text-sm text-ws-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ws-primary disabled:opacity-60"
                  />
                  <FieldError id="edit-item-name-error" message={validation.errors["edit-item-name"]} />

                  <label
                    htmlFor="edit-item-description"
                    className="mt-4 block text-sm font-medium text-ws-strong"
                  >
                    Deskripsi{" "}
                    <span className="font-normal text-ws-text">(opsional)</span>
                  </label>

                  <textarea
                    id="edit-item-description"
                    name="description"
                    defaultValue={item.description ?? ""}
                    rows={3}
                    maxLength={2000}
                    disabled={pending || unconfirmed}
                    aria-invalid={Boolean(validation.errors["edit-item-description"])}
                    aria-describedby={validation.errors["edit-item-description"] ? "edit-item-description-error" : error ? "edit-item-error" : undefined}
                    className="mt-2 w-full min-w-0 resize-none rounded-md border border-ws-control bg-ws-inset px-3 py-3 text-sm leading-6 text-ws-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ws-primary disabled:opacity-60"
                  />
                  <FieldError id="edit-item-description-error" message={validation.errors["edit-item-description"]} />

                  <p
                    id="edit-item-error"
                    role="alert"
                    className={
                      error
                        ? "mt-3 text-sm leading-6 text-ws-danger"
                        : "sr-only"
                    }
                  >
                    {error}
                  </p>
                  {expired ? (
                    <Link
                      href="/login"
                      className="mt-2 inline-flex min-h-11 items-center text-sm text-ws-primary underline"
                    >
                      Ke halaman masuk
                    </Link>
                  ) : null}
                  <div className="mt-6 flex flex-wrap justify-end gap-3">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => setOpen(false)}
                      className="ws-button-secondary px-4 disabled:cursor-wait"
                    >
                      {unconfirmed ? "Tutup" : "Batal"}
                    </button>
                    {unconfirmed ? (
                      <button
                        type="button"
                        onClick={() => {
                          setOpen(false);
                          router.refresh();
                        }}
                        className={actionClass}
                      >
                        Muat ulang data
                      </button>
                    ) : (
                      <button
                        type="submit"
                        disabled={pending}
                        className={actionClass}
                      >
                        {pending ? "Menyimpan…" : "Simpan"}
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
