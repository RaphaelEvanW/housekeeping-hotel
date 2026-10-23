"use client";

import { WorkspacePageHeading } from "@/components/workspace-page-heading";

export default function DeactivationError({ retry }: { retry: () => void }) {
  return (
    <main className="mx-auto max-w-[1440px] p-4 md:p-6 lg:p-8">
      <WorkspacePageHeading fallbackHref="/inventory">
        <h1 className="text-2xl font-semibold text-ws-strong">Pengajuan penonaktifan</h1>
      </WorkspacePageHeading>
      <div role="alert" className="mt-6 rounded-lg border border-ws-divider bg-ws-surface p-5">
        <h2 className="font-medium text-ws-strong">Daftar pengajuan belum berhasil dimuat</h2>
        <p className="mt-2 text-sm leading-6">Coba lagi. Jika masalah berlanjut, hubungi pengelola aplikasi.</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" onClick={retry} className="ws-button-secondary">Coba lagi</button>
        </div>
      </div>
    </main>
  );
}
