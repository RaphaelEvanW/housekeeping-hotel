import { WorkspacePageHeading } from "@/components/workspace-page-heading";

export default function GuestDetailLoading() {
  return <main aria-busy="true" className="mx-auto max-w-[1440px] space-y-6 p-4 md:p-6 lg:p-8"><WorkspacePageHeading fallbackHref="/guests"><h1 className="text-2xl font-semibold text-ws-strong">Detail tamu</h1></WorkspacePageHeading><p role="status" className="text-sm">Memuat tamu dan riwayat pinjaman…</p></main>;
}
