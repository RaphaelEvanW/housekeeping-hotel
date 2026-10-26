import Link from "next/link";
import { WorkspacePageHeading } from "@/components/workspace-page-heading";

export default function GuestNotFound() {
  return <main className="mx-auto max-w-[1440px] space-y-4 p-4 md:p-6 lg:p-8"><WorkspacePageHeading fallbackHref="/guests"><h1 className="text-2xl font-semibold text-ws-strong">Kunjungan tidak ditemukan</h1></WorkspacePageHeading><p className="text-sm">Pilih kunjungan dari daftar tamu.</p><Link href="/guests" className="ws-button-secondary">Daftar tamu</Link></main>;
}
