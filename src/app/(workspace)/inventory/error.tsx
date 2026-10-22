"use client";

export default function InventoryError({ reset }: { reset: () => void }) {
  return (
    <main className="p-4 md:p-6 lg:p-8">
      <h1 className="text-2xl font-semibold text-ws-strong">Inventaris</h1>
      <div role="alert" className="mt-6 rounded-lg border border-ws-divider bg-ws-surface p-6">
        <h2 className="font-medium text-ws-strong">Data belum berhasil dimuat</h2>
        <p className="mt-2 text-sm">Coba lagi. Jika masalah berlanjut, hubungi pengelola aplikasi.</p>
        <button onClick={reset} className="mt-5 min-h-11 rounded-md bg-ws-primary px-4 text-sm font-medium text-white hover:bg-ws-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ws-primary">Coba lagi</button>
      </div>
    </main>
  );
}
