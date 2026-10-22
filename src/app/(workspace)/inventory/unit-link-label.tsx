"use client";

import { useLinkStatus } from "next/link";

export function UnitLinkLabel() {
  const { pending } = useLinkStatus();
  return <span aria-live="polite" aria-busy={pending}>{pending ? "Memuat detail…" : "Detail barang"}</span>;
}
