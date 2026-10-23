"use client";

import { useEffect, useRef, useState, type ReactNode, type SyntheticEvent } from "react";
import { WorkspaceControlIcon } from "@/components/workspace-control-icon";

export const filterOptionClass = "flex min-h-11 w-full cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-3 text-left text-sm hover:bg-ws-inset focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ws-primary";

export function closeFilterDropdown(event: SyntheticEvent<HTMLElement>) {
  const dropdown = event.currentTarget.closest("details");
  if (dropdown instanceof HTMLDetailsElement) {
    dropdown.open = false;
    dropdown.querySelector("summary")?.focus();
  }
}

export function WorkspaceFilterDropdown({ id, label, value, children, className = "", onOpenChange }: {
  id: string;
  label: string;
  value: string;
  children: ReactNode;
  className?: string;
  onOpenChange?: (open: boolean) => void;
}) {
  const dropdown = useRef<HTMLDetailsElement>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!expanded) return;
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && dropdown.current && !dropdown.current.contains(event.target)) dropdown.current.open = false;
    }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [expanded]);

  return (
    <div className={`min-w-0 ${className}`}>
      <span id={`${id}-label`} className="mb-2 block text-xs font-medium text-ws-strong">{label}</span>
      <details
        ref={dropdown} className="group/filter relative"
        onToggle={event => { const open = event.currentTarget.open; setExpanded(open); onOpenChange?.(open); }}
        onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closeFilterDropdown(event); } }}
        onBlur={event => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false; }}
      >
        <summary aria-labelledby={`${id}-label ${id}-value`} className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-md border border-ws-control bg-ws-inset px-3 text-sm text-ws-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ws-primary [&::-webkit-details-marker]:hidden">
          <span id={`${id}-value`} className="min-w-0 truncate" title={value}>{value}</span>
          <span className="rotate-90 group-open/filter:-rotate-90"><WorkspaceControlIcon name="caretRight" /></span>
        </summary>
        <div
          className="absolute top-full right-0 left-0 z-20 mt-2 min-w-0 rounded-lg border border-ws-divider bg-ws-surface p-3 shadow-lg"
        >
          {children}
        </div>
      </details>
    </div>
  );
}
