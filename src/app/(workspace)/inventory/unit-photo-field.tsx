"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { FieldError } from "@/components/field-error";
import { stockPhotoError } from "@/lib/stock-upload";

export function UnitPhotoField({ index, error }: { index: number; error?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const previewUrls = useRef<string[]>([]);
  const [previews, setPreviews] = useState<{ name: string; url: string }[]>([]);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const message = selectionError ?? error;
  const id = `stock-unit-photo-${index}`;

  useEffect(() => {
    const urls = previewUrls.current;
    return () => urls.forEach(url => URL.revokeObjectURL(url));
  }, []);

  function select(files: File[]) {
    const invalid = stockPhotoError(files);
    input.current?.setCustomValidity(invalid);
    setSelectionError(invalid);
    previewUrls.current.forEach(url => URL.revokeObjectURL(url));
    previewUrls.current.splice(0);
    const next = invalid ? [] : files.map(file => {
      const url = URL.createObjectURL(file);
      previewUrls.current.push(url);
      return { name: file.name, url };
    });
    setPreviews(next);
  }

  return (
    <div className="min-w-0 sm:col-span-2">
      <label htmlFor={id} className="block text-sm font-medium text-ws-strong">
        Foto awal unit <span aria-hidden="true">*</span>
      </label>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <input
          ref={input}
          id={id}
          name={`photo-${index}`}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          required
          data-required-message="Pilih minimal satu foto awal unit."
          aria-invalid={Boolean(message)}
          aria-describedby={`${id}-help ${id}-error`}
          className="peer sr-only"
          onChange={event => select(Array.from(event.currentTarget.files ?? []))}
        />
        <label
          htmlFor={id}
          className="ws-button-secondary cursor-pointer peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ws-primary peer-disabled:pointer-events-none peer-disabled:opacity-60"
        >
          {previews.length ? "Ganti foto" : "Pilih foto"}
        </label>
        <span className="text-xs" aria-live="polite">
          {previews.length ? `${previews.length} foto dipilih` : "Belum ada foto"}
        </span>
        {previews.length ? (
          <button type="button" className="ws-button-secondary ml-auto" onClick={() => {
            if (input.current) input.current.value = "";
            select([]);
          }}>
            Hapus pilihan
          </button>
        ) : null}
      </div>
      <p id={`${id}-help`} className="mt-2 text-xs leading-5">
        Minimal satu foto kondisi awal. JPEG, PNG, atau WebP statis, maksimal 2 MiB per foto.
      </p>
      <FieldError id={`${id}-error`} message={message} />
      {previews.length ? (
        <ul className="mt-3 flex flex-wrap gap-3">
          {previews.map((photo, photoIndex) => (
            <li key={photo.url} className="w-24 min-w-0">
              <Image src={photo.url} alt={`Pratinjau unit ${index + 1}, foto ${photoIndex + 1}`} width={96} height={80} unoptimized className="h-20 w-24 rounded-md border border-ws-divider object-cover" />
              <p className="mt-1 truncate text-xs" title={photo.name}>{photo.name}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
