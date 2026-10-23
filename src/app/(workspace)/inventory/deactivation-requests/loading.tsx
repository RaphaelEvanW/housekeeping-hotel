import { WorkspacePageHeading } from "@/components/workspace-page-heading";

export default function DeactivationLoading() {
  return (
    <main role="status" aria-label="Memuat pengajuan penonaktifan" className="mx-auto max-w-[1440px] space-y-6 p-4 md:p-6 lg:p-8">
      <WorkspacePageHeading fallbackHref="/inventory">
        <h1 className="text-2xl font-semibold text-ws-strong">Pengajuan penonaktifan</h1>
      </WorkspacePageHeading>
      <p className="text-sm">Memuat daftar pengajuan…</p>
      <div aria-hidden="true" className="divide-y divide-ws-divider rounded-lg border border-ws-divider bg-ws-surface">
        {[0, 1, 2].map(row => <div key={row} className="h-28" />)}
      </div>
    </main>
  );
}
