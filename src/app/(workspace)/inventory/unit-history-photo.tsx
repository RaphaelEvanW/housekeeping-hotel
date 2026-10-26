"use client";

import Image from "next/image";
import { useState } from "react";

export function UnitHistoryPhoto({ url, label }: { url: string; label: string }) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  return (
    <li className="w-28 min-w-0">
      {status !== "error" ? (
        <a href={url} target="_blank" rel="noopener noreferrer" aria-label={`Buka ${label} (tab baru)`} className="relative block h-24 w-28 overflow-hidden rounded-md border border-ws-divider bg-ws-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ws-primary">
          {status === "loading" ? <span className="absolute inset-0 flex items-center justify-center text-xs" role="status">Memuat foto…</span> : null}
          <Image src={url} alt={label} width={112} height={96} unoptimized className={`h-24 w-28 object-cover ${status === "loading" ? "opacity-0" : ""}`} onLoad={() => setStatus("ready")} onError={() => setStatus("error")} />
        </a>
      ) : (
        <div className="rounded-md border border-ws-divider p-2">
          <p role="status" className="text-xs leading-5 text-ws-danger">Foto gagal dimuat.</p>
          <button type="button" className="ws-button-secondary mt-2 w-full px-2 text-xs" aria-label={`Muat ulang ${label}`} onClick={() => setStatus("loading")}>Coba lagi</button>
        </div>
      )}
      <p className="mt-1 text-xs leading-5">{label}</p>
    </li>
  );
}
