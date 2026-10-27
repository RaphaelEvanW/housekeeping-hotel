"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type SubmitEvent } from "react";
import { FieldError } from "@/components/field-error";
import { WorkspaceControlIcon } from "@/components/workspace-control-icon";
import { useInventoryForm } from "@/lib/use-inventory-form";
import { usePhotoSelection } from "@/lib/use-photo-selection";
import { MAX_UPLOAD_BYTES, stockPhotoError } from "@/lib/stock-upload";

const MAX_CATALOG_PHOTOS = 10;

const primaryClass =
  "inline-flex min-h-11 items-center justify-center rounded-md bg-ws-primary px-4 text-sm leading-5 font-medium tracking-[0.01em] text-white hover:bg-ws-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ws-primary disabled:cursor-wait disabled:opacity-60";

export function CreateItemDialog() {
  const router = useRouter();
  const validation = useInventoryForm();
  const dialog = useRef<HTMLDialogElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const previousOverflow = useRef("");
  const submitting = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [invalidName, setInvalidName] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [notice, setNotice] = useState("");
  const {
    input: photoInput,
    previews: photoPreviews,
    error: photoSelectionError,
    append: appendPhotos,
    remove: removePhoto,
    reset: resetPhotos,
  } = usePhotoSelection(MAX_CATALOG_PHOTOS);

  useEffect(() => {
    const element = dialog.current;
    return () => {
      if (element?.open) {
        element.close();
        document.body.style.overflow = previousOverflow.current;
      }
    };
  }, []);

  function open() {
    validation.reset();
    resetPhotos();
    setError("");
    setInvalidName(false);
    setSessionExpired(false);
    setNotice("");
    dialog.current?.querySelector("form")?.reset();
    previousOverflow.current = document.body.style.overflow;
    dialog.current?.showModal();
    document.body.style.overflow = "hidden";
    nameInput.current?.focus();
  }

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    if (!validation.validate(event.currentTarget)) return;
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    setError("");
    setInvalidName(false);
    setSessionExpired(false);
    if (!name) {
      setError("Nama jenis barang wajib diisi.");
      setInvalidName(true);
      nameInput.current?.focus();
      return;
    }
    const photos = form
      .getAll("photo")
      .filter(
        (entry): entry is File =>
          entry instanceof File && (entry.size > 0 || entry.name !== ""),
      );
    const photoError = photos.length ? stockPhotoError(photos) : "";
    if (photoError || photos.length > MAX_CATALOG_PHOTOS) {
      setError(photoError || `Maksimal ${MAX_CATALOG_PHOTOS} foto katalog.`);
      return;
    }
    if (photos.reduce((total, photo) => total + photo.size, 0) >= MAX_UPLOAD_BYTES) {
      setError("Total unggahan maksimal 16 MiB. Kurangi ukuran atau jumlah foto.");
      return;
    }
    form.delete("photo");
    photos.forEach((photo) => form.append("photo", photo));
    form.set("name", name);
    submitting.current = true;
    setPending(true);
    try {
      const response = await fetch("/api/items", {
        method: "POST",
        body: form,
      });
      if (response.status !== 201) {
        setSessionExpired(response.status === 401);
        const failure: unknown = await response.json().catch(() => null);
        const serverMessage =
          failure &&
          typeof failure === "object" &&
          "message" in failure &&
          typeof failure.message === "string"
            ? failure.message
            : null;
        setInvalidName(
          response.status === 409 ||
            (response.status === 400 &&
              serverMessage?.startsWith("Nama jenis barang") === true),
        );
        setError(
          response.status === 409
            ? "Jenis barang dengan nama tersebut sudah ada. Gunakan jenis yang sudah terdaftar atau periksa kembali namanya."
            : response.status === 400
              ? (serverMessage ?? "Periksa nama, deskripsi, dan foto barang.")
              : response.status === 401
                ? "Sesi Anda berakhir. Masuk kembali untuk melanjutkan."
                : response.status === 403
                  ? "Akun Anda tidak memiliki izin untuk menambah jenis barang."
                  : response.status === 413
                    ? "Total unggahan maksimal 16 MiB termasuk data form. Kurangi ukuran atau jumlah foto."
                    : "Penyimpanan belum dapat dipastikan. Periksa katalog sebelum mencoba kembali.",
        );
        return;
      }
      setNotice("Jenis barang berhasil ditambahkan.");
      dialog.current?.close();
      router.push(
        `/inventory?${new URLSearchParams({ q: name.replace(/\s+/gu, " ").toLowerCase(), page: "1" })}`,
      );
      router.refresh();
    } catch {
      setError(
        "Koneksi terputus. Periksa katalog sebelum mencoba kembali karena penyimpanan mungkin sudah diproses.",
      );
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  return (
    <div className="w-full sm:w-auto">
      <button
        type="button"
        onClick={open}
        aria-haspopup="dialog"
        className={`${primaryClass} w-full sm:min-h-9! sm:w-auto sm:px-3! sm:text-xs!`}
      >
        Tambah jenis barang
      </button>
      <p
        role="status"
        className={
          notice ? "mt-2 max-w-md text-xs leading-5 text-ws-success" : "sr-only"
        }
      >
        {notice}
      </p>
      <dialog
        ref={dialog}
        aria-labelledby="create-item-heading"
        aria-describedby="create-item-description"
        onKeyDown={(event) => {
          if (event.key === "Escape") event.stopPropagation();
        }}
        onCancel={(event) => {
          if (submitting.current) event.preventDefault();
        }}
        onClose={() => {
          document.body.style.overflow = previousOverflow.current;
        }}
        className="fixed inset-0 m-auto max-h-[calc(100svh-32px)] w-[calc(100%-32px)] max-w-lg flex-col overflow-hidden rounded-lg border-0 bg-ws-surface p-0 font-workspace text-ws-text shadow-xl backdrop:bg-black/35 open:flex [color-scheme:light]"
      >
        <header className="shrink-0 border-b border-ws-divider px-6 py-4">
        <div className="flex items-center justify-between gap-3">
        <h2
          id="create-item-heading"
          className="font-heading text-xl leading-7 font-semibold text-ws-strong"
        >
          Tambah jenis barang
        </h2>
        <button type="button" disabled={pending} onClick={() => dialog.current?.close()} aria-label="Tutup tambah jenis barang" className="inline-flex size-11 shrink-0 items-center justify-center rounded-md hover:bg-ws-inset focus-visible:outline-2 focus-visible:outline-ws-primary"><WorkspaceControlIcon name="close" /></button>
        </div>
        <p id="create-item-description" className="mt-2 text-sm leading-6">
          Daftarkan nama jenis barang terlebih dahulu. Langkah ini belum
          menambahkan stok atau unit fisik.
        </p>
        </header>
        <form onSubmit={submit} noValidate onInput={validation.onInput} aria-busy={pending} className="flex min-h-0 flex-col">
          <div className="min-h-0 overflow-y-auto overscroll-contain p-6">
          <p className="mb-4 text-xs">* Wajib diisi</p>
          <label
            htmlFor="create-item-name"
            className="block text-sm font-medium text-ws-strong"
          >
            Nama jenis barang <span aria-hidden="true">*</span>
          </label>
          <input
            ref={nameInput}
            id="create-item-name"
            name="name"
            type="text"
            required
            maxLength={100}
            disabled={pending}
            aria-invalid={invalidName || Boolean(validation.errors["create-item-name"]) || undefined}
            aria-describedby={
              `create-item-help${error ? " create-item-error" : ""}${validation.errors["create-item-name"] ? " create-item-name-error" : ""}`
            }
            className="mt-2 min-h-11 w-full min-w-0 rounded-md border border-ws-control bg-ws-inset px-3 text-sm text-ws-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ws-primary disabled:cursor-wait"
          />
          <FieldError id="create-item-name-error" message={validation.errors["create-item-name"]} />
          <p id="create-item-help" className="mt-2 text-xs leading-5">
            Maksimal 100 karakter. Contoh: Hair dryer. Hindari membuat jenis
            yang sudah terdaftar.
          </p>
          <label
            htmlFor="create-item-description-input"
            className="mt-5 block text-sm font-medium text-ws-strong"
          >
            Deskripsi{" "}
            <span className="font-normal text-ws-text">(opsional)</span>
          </label>
          <textarea
            id="create-item-description-input"
            name="description"
            maxLength={2000}
            aria-invalid={Boolean(validation.errors["create-item-description-input"])}
            aria-describedby={validation.errors["create-item-description-input"] ? "create-item-description-error" : undefined}
            rows={3}
            disabled={pending}
            className="mt-2 w-full min-w-0 resize-none rounded-md border border-ws-control bg-ws-inset px-3 py-3 text-sm leading-5 text-ws-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ws-primary"
          />
          <FieldError id="create-item-description-error" message={validation.errors["create-item-description-input"]} />
          <p className="mt-1 text-xs leading-5">
            Keterangan jenis barang, maksimal 2000 karakter.
          </p>
          <label
            htmlFor="create-item-photo"
            className="mt-5 block text-sm font-medium text-ws-strong"
          >
            Foto katalog{" "}
            <span className="font-normal text-ws-text">(opsional)</span>
          </label>
          <div className="mt-2 flex flex-wrap items-center gap-3 rounded-md border border-ws-control p-2">
            <input
              ref={photoInput}
              id="create-item-photo"
              name="photo"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              disabled={pending}
              aria-describedby="create-item-photo-help create-item-photo-error"
              onChange={(event) =>
                appendPhotos(Array.from(event.currentTarget.files ?? []))
              }
              className="peer sr-only"
            />
            <label
              htmlFor="create-item-photo"
              aria-disabled={pending}
              className="ws-button-secondary shrink-0 cursor-pointer peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ws-primary peer-disabled:cursor-wait"
            >
              {photoPreviews.length ? "Tambah foto" : "Pilih foto"}
            </label>
            <span className="min-w-0 break-all text-xs" aria-live="polite">
              {photoPreviews.length
                ? `${photoPreviews.length}/${MAX_CATALOG_PHOTOS} foto dipilih`
                : "Belum ada foto dipilih"}
            </span>
            {photoPreviews.length ? (
              <button
                type="button"
                disabled={pending}
                className="ws-button-secondary ml-auto"
                onClick={resetPhotos}
              >
                Hapus semua
              </button>
            ) : null}
          </div>
          <FieldError
            id="create-item-photo-error"
            message={photoSelectionError}
          />
          <p id="create-item-photo-help" className="mt-2 text-xs leading-5">
            JPEG, PNG, atau WebP statis. Maksimal {MAX_CATALOG_PHOTOS} foto, 2 MiB per foto, dan 16 MiB per unggahan. Foto pertama menjadi foto utama.
          </p>
          {photoPreviews.length ? (
            <ul className="mt-3 flex flex-wrap gap-3">
              {photoPreviews.map((photo, index) => (
                <li key={photo.url} className="w-24 min-w-0">
                  <Image
                    src={photo.url}
                    alt={`Pratinjau foto katalog ${index + 1}`}
                    width={96}
                    height={80}
                    unoptimized
                    className="h-20 w-24 rounded-md border border-ws-divider object-cover"
                  />
                  <p className="mt-1 truncate text-xs" title={photo.name}>
                    {index === 0 ? `Foto utama · ${photo.name}` : photo.name}
                  </p>
                  <button
                    type="button"
                    disabled={pending}
                    className="ws-button-secondary mt-2 min-h-11 w-full px-2 text-xs"
                    aria-label={`Hapus foto katalog ${index + 1}: ${photo.name}`}
                    onClick={() => removePhoto(index)}
                  >
                    Hapus
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <p
            id="create-item-error"
            role="alert"
            className={
              error ? "mt-4 text-sm leading-6 text-ws-danger" : "sr-only"
            }
          >
            {error}
          </p>
          {sessionExpired ? (
            <Link
              href="/login"
              className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-ws-primary underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ws-primary"
            >
              Ke halaman masuk
            </Link>
          ) : null}
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-3 border-t border-ws-divider px-6 py-4">
            <button
              type="button"
              disabled={pending}
              onClick={() => dialog.current?.close()}
              className="ws-button-secondary px-4 disabled:cursor-wait"
            >
              Batal
            </button>
            <button type="submit" disabled={pending} className={primaryClass}>
              {pending ? "Menyimpan…" : "Simpan jenis barang"}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
