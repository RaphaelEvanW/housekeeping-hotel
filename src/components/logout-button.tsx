"use client";

import { useState } from "react";

import { authClient } from "@/lib/auth-client";
import { WorkspaceControlIcon } from "./workspace-control-icon";

export function LogoutButton({ compact = false }: { compact?: boolean }) {
  const [isPending, setIsPending] = useState(false);
  const [message, setMessage] = useState("");

  async function handleLogout() {
    if (isPending) return;

    setIsPending(true);
    setMessage("");

    try {
      const { error } = await authClient.signOut();

      if (error) {
        setMessage("Logout gagal. Coba lagi.");
        return;
      }

      window.location.replace("/login");
    } catch {
      setMessage("Tidak dapat menghubungi server. Coba lagi.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleLogout}
        disabled={isPending}
        title={compact ? "Keluar" : undefined}
        className={`inline-flex min-h-11 shrink-0 items-center justify-center rounded-md py-2 text-sm font-medium text-inherit focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current disabled:cursor-wait disabled:opacity-50 ${compact ? "w-11 hover:bg-white/10" : "border border-current px-4 hover:opacity-80"}`}
      >
        {compact ? <WorkspaceControlIcon name="logout" /> : null}
        <span className={compact ? "sr-only" : undefined}>{isPending ? "Sedang keluar…" : "Keluar"}</span>
      </button>

      <p role="status" className={`${message ? "mt-2" : ""} max-w-64 break-words text-sm text-inherit`}>
        {message}
      </p>
    </div>
  );
}
