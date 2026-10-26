"use client";

import { useState } from "react";
import { WorkspaceFilterDropdown, closeFilterDropdown, filterOptionClass } from "@/components/workspace-filter-dropdown";

export function StatusFilter({ initialValue, options, label = "Status tamu" }: {
  initialValue: string;
  options: { value: string; label: string }[];
  label?: string;
}) {
  const [selectedValue, setSelectedValue] = useState(initialValue);
  const selected = options.find((option) => option.value === selectedValue) ?? options[0];
  return (
    <>
      <input type="hidden" name="status" value={selected.value} />
      <WorkspaceFilterDropdown id="guest-status" label={label} value={selected.label} className="min-w-48 flex-1 basis-40">
        <ul aria-label={`Pilihan ${label.toLowerCase()}`} className="max-h-52 overflow-y-auto overscroll-contain">
          {options.map((option) => (
            <li key={option.value}>
              <button
                type="button"
                aria-pressed={option.value === selected.value}
                onClick={(event) => {
                  setSelectedValue(option.value);
                  closeFilterDropdown(event);
                }}
                className={`${filterOptionClass} ${option.value === selected.value ? "bg-ws-inset font-medium text-ws-primary" : "text-ws-strong"}`}
              >
                {option.label}
                {option.value === selected.value ? <span className="sr-only">Dipilih</span> : null}
              </button>
            </li>
          ))}
        </ul>
      </WorkspaceFilterDropdown>
    </>
  );
}
