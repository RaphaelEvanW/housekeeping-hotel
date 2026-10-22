"use client";

import { useState, type ReactNode } from "react";

/** Switches presentation only; both views use the same server-rendered records. */
export function InventoryView({ cards, table }: { cards: ReactNode; table: ReactNode }) {
  const [view, setView] = useState<"cards" | "table">("cards");

  return (
    <div>
      <div role="group" aria-label="Tampilan inventaris" className="mb-4 flex justify-end gap-1">
        {(["cards", "table"] as const).map((value) => (
          <button key={value} type="button" aria-pressed={view === value} onClick={() => setView(value)} className={`min-h-11 rounded px-3 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ws-primary ${view === value ? "bg-ws-sidebar text-white" : "bg-white text-ws-strong hover:bg-ws-inset"}`}>
            {value === "cards" ? "Kartu" : "Tabel"}
          </button>
        ))}
      </div>
      <div hidden={view !== "cards"}>{cards}</div>
      <div hidden={view !== "table"} className="overflow-hidden rounded-lg bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)]">{table}</div>
    </div>
  );
}
