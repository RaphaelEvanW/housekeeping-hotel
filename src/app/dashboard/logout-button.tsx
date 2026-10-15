"use client";

import { useState } from "react";

import { authClient } from "@/lib/auth-client";

export function LogoutButton() {
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
    <div className="mt-6">
      <button
        type="button"
        onClick={handleLogout}
        disabled={isPending}
        className="rounded-lg border px-4 py-2 disabled:opacity-50"
      >
        {isPending ? "Sedang keluar…" : "Keluar"}
      </button>

      <p role="status" className="mt-2">
        {message}
      </p>
    </div>
  );
}