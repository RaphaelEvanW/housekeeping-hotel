"use client";

import { useRouter } from "next/navigation";
import { WorkspaceControlIcon } from "@/components/workspace-control-icon";

export function WorkspaceBackButton({ fallbackHref = "/start" }: { fallbackHref?: string }) {
  const router = useRouter();

  return (
    <button
      type="button"
      aria-label="Kembali ke halaman sebelumnya"
      title="Kembali"
      onClick={() => {
        if (window.history.length > 1) router.back();
        else router.replace(fallbackHref);
      }}
      className="ws-button-secondary size-11 shrink-0 cursor-pointer p-0"
    >
      <span className="rotate-180"><WorkspaceControlIcon name="caretRight" /></span>
    </button>
  );
}
