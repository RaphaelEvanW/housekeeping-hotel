"use client";

import { useState, type ReactNode } from "react";

/** Switches presentation only; both views use the same server-rendered records. */
export function InventoryView({
  cards,
  table,
}: {
  cards: ReactNode;
  table: ReactNode;
}) {
  const [view, setView] = useState<"cards" | "table">("cards");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        role="group"
        aria-label="Tampilan inventaris"
        className="mb-3 flex shrink-0 justify-end gap-1"
      >
        {(["cards", "table"] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={view === value}
            onClick={() => setView(value)}
            className="ws-button-secondary sm:min-h-9! sm:text-xs!"
          >
            {value === "cards" ? "Kartu" : "Tabel"}
          </button>
        ))}
      </div>
      <div role="region" aria-label="Hasil katalog inventaris" tabIndex={0} className="min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-lg p-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ws-primary">
      <div hidden={view !== "cards"}>{cards}</div>
      <div
        hidden={view !== "table"}
        className="overflow-hidden rounded-lg bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
      >
        {table}
      </div>
      </div>
    </div>
  );
}
