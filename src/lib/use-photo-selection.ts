"use client";

import { useEffect, useRef, useState } from "react";
import { stockPhotoError } from "@/lib/stock-upload";

export function appendPhotoSelection(
  current: File[],
  added: File[],
  maxFiles = Infinity,
) {
  if (added.length === 0) return { files: current, error: "" };

  const next = [...current, ...added];
  const error =
    next.length > maxFiles
      ? `Maksimal ${maxFiles} foto.`
      : stockPhotoError(added);

  return error
    ? { files: current, error: `Foto baru tidak ditambahkan. ${error}` }
    : { files: next, error: "" };
}

export function usePhotoSelection(maxFiles = Infinity) {
  const input = useRef<HTMLInputElement>(null);
  const selected = useRef<File[]>([]);
  const urls = useRef<string[]>([]);
  const [previews, setPreviews] = useState<{ name: string; url: string }[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const allocated = urls.current;
    const element = input.current;
    const stopCancel = (event: Event) => event.stopPropagation();
    element?.addEventListener("cancel", stopCancel);
    return () => {
      element?.removeEventListener("cancel", stopCancel);
      allocated.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  function syncInput(files: File[]) {
    if (!input.current) return;

    const transfer = new DataTransfer();
    files.forEach((file) => transfer.items.add(file));
    input.current.files = transfer.files;
    input.current.setCustomValidity("");
  }

  function commit(files: File[]) {
    syncInput(files);
    selected.current = files;

    urls.current.forEach((url) => URL.revokeObjectURL(url));
    urls.current.splice(0);

    setPreviews(
      files.map((file) => {
        const url = URL.createObjectURL(file);
        urls.current.push(url);
        return { name: file.name, url };
      }),
    );
    setError("");

    input.current?.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function append(files: File[]) {
    const result = appendPhotoSelection(selected.current, files, maxFiles);

    if (result.error) {
      syncInput(selected.current);
      setError(result.error);
      return;
    }

    if (files.length === 0) {
      syncInput(selected.current);
      return;
    }

    commit(result.files);
  }

  function remove(index: number) {
    commit(selected.current.filter((_, current) => current !== index));
    requestAnimationFrame(() => input.current?.focus());
  }

  function reset() {
    commit([]);
  }

  return { input, previews, error, append, remove, reset };
}
