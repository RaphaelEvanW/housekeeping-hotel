"use client";

import Image from "next/image";
import { usePhotoSelection } from "@/lib/use-photo-selection";
import { FieldError } from "@/components/field-error";

export function UnitPhotoField({
  index,
  error,
  purpose = "initial",
  required = true,
}: {
  index: number;
  error?: string;
    purpose?: "initial" | "issue" | "return" | "condition" | "verification" | "handover" | "receipt";
  required?: boolean;
}) {
  const { input, previews, error: selectionError, append, remove, reset } =
    usePhotoSelection();
  const message = selectionError || error;
  const id = `${purpose === "initial" ? "stock" : purpose}-unit-photo-${index}`;
  const labels = {
    initial: "Foto awal unit",
    issue: "Foto saat dipinjamkan",
    return: "Foto pengembalian",
    condition: "Foto kondisi unit",
    verification: "Foto verifikasi",
    handover: "Foto bukti kerusakan",
    receipt: "Foto penerimaan unit",
  } as const;
  const helpers = {
    initial: "Minimal satu foto kondisi awal.",
    issue: "Foto kondisi unit saat diserahkan ke tamu.",
    return: required
      ? "Minimal satu foto wajib untuk kondisi selain baik."
      : "Foto boleh dilampirkan untuk kondisi baik.",
    condition: "Lampirkan minimal satu foto terbaru yang menunjukkan kondisi unit.",
    verification: "Minimal satu foto hasil pemeriksaan untuk setiap unit.",
    handover: "Minimal satu foto kondisi unit saat diserahkan ke Engineering.",
    receipt: "Minimal satu foto kondisi unit saat diterima kembali.",
  } as const;
  const label = labels[purpose];

  return (
    <div className="min-w-0 sm:col-span-2">
      <label htmlFor={id} className="block text-sm font-medium text-ws-strong">
        {label} {required ? <span aria-hidden="true">*</span> : <span className="font-normal">(opsional)</span>}
      </label>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <input
          ref={input}
          id={id}
          name={`photo-${index}`}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          required={required}
          data-required-message={`Pilih minimal satu ${label.toLowerCase()}.`}
          aria-invalid={Boolean(message)}
          aria-describedby={`${id}-help ${id}-error`}
          className="peer sr-only"
          onChange={(event) =>
            append(Array.from(event.currentTarget.files ?? []))
          }
        />
        <label
          htmlFor={id}
          className="ws-button-secondary cursor-pointer peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ws-primary peer-disabled:pointer-events-none peer-disabled:opacity-60"
        >
          {previews.length ? "Tambah foto" : "Pilih foto"}
        </label>
        <span className="text-xs" aria-live="polite">
          {previews.length
            ? `${previews.length} foto dipilih`
            : "Belum ada foto"}
        </span>
        {previews.length ? (
          <button
            type="button"
            className="ws-button-secondary ml-auto"
            onClick={reset}
          >
            Hapus pilihan
          </button>
        ) : null}
      </div>
      <p id={`${id}-help`} className="mt-2 text-xs leading-5">
        {helpers[purpose]}{" "}
        JPEG, PNG, atau WebP statis, maksimal 2 MiB per foto.
      </p>
      <FieldError id={`${id}-error`} message={message} />
      {previews.length ? (
        <ul className="mt-3 flex flex-wrap gap-3">
          {previews.map((photo, photoIndex) => (
            <li key={photo.url} className="w-24 min-w-0">
              <Image
                src={photo.url}
                alt={`Pratinjau unit ${index + 1}, foto ${photoIndex + 1}`}
                width={96}
                height={80}
                unoptimized
                className="h-20 w-24 rounded-md border border-ws-divider object-cover"
              />
              <p className="mt-1 truncate text-xs" title={photo.name}>
                {photo.name}
              </p>
              <button
                type="button"
                className="ws-button-secondary mt-2 min-h-11 w-full px-2 text-xs"
                aria-label={`Hapus pilihan foto ${photoIndex + 1}: ${photo.name}`}
                onClick={() => remove(photoIndex)}
              >
                Hapus
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
