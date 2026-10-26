"use client";

export default function GuestsError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main className="mx-auto max-w-[1440px] space-y-4 p-4 md:p-6 lg:p-8">
      <h1 className="font-heading text-2xl font-semibold text-ws-strong">Daftar tamu belum dapat dimuat</h1>
      <p role="alert" className="text-sm leading-6 text-ws-danger">Terjadi kendala saat mengambil data kunjungan. Coba muat ulang halaman ini.</p>
      <button type="button" onClick={retry} className="ws-button-secondary">Coba lagi</button>
    </main>
  );
}
