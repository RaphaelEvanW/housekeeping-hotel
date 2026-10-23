"use client";

import { useState } from "react";
import { WorkspaceFilterDropdown, closeFilterDropdown, filterOptionClass } from "@/components/workspace-filter-dropdown";

export function StatusFilter({ initialValue, options }: {
  initialValue: string;
  options: { value: string; label: string }[];
}) {
  const [selected, setSelected] = useState(initialValue);
  const [search, setSearch] = useState("");
  const label = options.find(option => option.value === selected)!.label;
  const visible = options.filter(option => option.label.toLocaleLowerCase("id-ID").includes(search.trim().toLocaleLowerCase("id-ID")));

  return (
    <>
      <input type="hidden" name="status" value={selected} />
      <WorkspaceFilterDropdown id="deactivation-status" label="Status pengajuan" value={label} className="flex-1 basis-40 sm:min-w-48">
            <label htmlFor="status-filter-search" className="sr-only">Cari status pengajuan</label>
            <input id="status-filter-search" type="search" value={search} onChange={event => setSearch(event.target.value)} onKeyDown={event => { if (event.key === "Enter") event.preventDefault(); }} placeholder="Cari status…" autoComplete="off" className="min-h-11 w-full min-w-0 rounded-md border border-ws-control bg-ws-inset px-3 text-sm text-ws-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ws-primary" />
            <ul aria-label="Pilihan status pengajuan" className="mt-2 max-h-52 overflow-y-auto overscroll-contain border-t border-ws-divider">
              {visible.map(option => (
                <li key={option.value}>
                  <button type="button" onClick={event => { setSelected(option.value); closeFilterDropdown(event); }} className={`${filterOptionClass} ${option.value === selected ? "bg-ws-inset font-medium text-ws-primary" : "text-ws-strong"}`}>
                    {option.label}{option.value === selected ? <span className="sr-only">Dipilih</span> : null}
                  </button>
                </li>
              ))}
            </ul>
            {visible.length === 0 ? <p className="px-2 py-4 text-xs">Status tidak ditemukan.</p> : null}
      </WorkspaceFilterDropdown>
    </>
  );
}
