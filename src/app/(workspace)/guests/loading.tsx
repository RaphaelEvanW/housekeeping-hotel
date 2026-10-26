export default function GuestsLoading() {
  return (
    <main className="mx-auto max-w-[1440px] space-y-6 p-4 md:p-6 lg:p-8" aria-busy="true">
      <div className="h-10 w-52 animate-pulse rounded bg-ws-inset" />
      <p role="status" className="text-sm text-ws-text">Memuat daftar tamu…</p>
    </main>
  );
}
