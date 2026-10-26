"use client";

import { WorkspacePageHeading } from "@/components/workspace-page-heading";

export default function GuestDetailError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <main className="mx-auto max-w-[1440px] space-y-4 p-4 md:p-6 lg:p-8"><WorkspacePageHeading fallbackHref="/guests"><h1 className="text-2xl font-semibold text-ws-strong">Detail tamu belum dapat dimuat</h1></WorkspacePageHeading><p role="alert" className="text-sm text-ws-danger">Data tamu atau riwayat pinjaman belum berhasil diambil.</p><button type="button" onClick={retry} className="ws-button-secondary">Coba lagi</button></main>;
}
