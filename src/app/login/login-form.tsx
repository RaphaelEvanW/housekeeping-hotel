"use client";

import { useState, type SubmitEvent } from "react";

import { authClient } from "@/lib/auth-client";

export function LoginForm() {
  const [isPending, setIsPending] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isPending) return;

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");

    setIsPending(true);
    setMessage("");

    try {
      const { error } = await authClient.signIn.email({
        email,
        password,
      });

      if (error) {
        setMessage(
          "Login gagal. Periksa email dan kata sandi, lalu coba lagi.",
        );
        return;
      }

      window.location.replace("/start");
    } catch {
      setMessage("Tidak dapat menghubungi server. Coba lagi.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      aria-busy={isPending}
      aria-describedby={message ? "login-message" : undefined}
      className="grid gap-5"
    >
      <div>
        <label
          htmlFor="email"
          className="mb-2 block text-sm font-medium text-white"
        >
          Email
        </label>

        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="nama@hotel.com"
          required
          disabled={isPending}
          className="min-h-12 w-full min-w-0 rounded-md border border-white/20 bg-ws-sidebar/95 px-3 py-3 text-base text-white backdrop-blur-sm supports-[backdrop-filter:blur(1px)]:bg-ws-sidebar/25 placeholder:text-ws-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ws-accent disabled:cursor-wait"
        />
      </div>

      <div>
        <label
          htmlFor="password"
          className="mb-2 block text-sm font-medium text-white"
        >
          Kata sandi
        </label>

        <div className="relative">
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="Masukkan kata sandi"
            required
            disabled={isPending}
            className="min-h-12 w-full min-w-0 rounded-md border border-white/20 bg-ws-sidebar/95 px-3 py-3 text-base text-white backdrop-blur-sm supports-[backdrop-filter:blur(1px)]:bg-ws-sidebar/25 placeholder:text-ws-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ws-accent disabled:cursor-wait"
          />
        </div>
      </div>

      {message ? (
        <p
          id="login-message"
          role="alert"
          className="rounded-md border border-hk-danger bg-ws-sidebar/95 px-3 py-3 text-sm leading-6 text-hk-danger"
        >
          {message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isPending}
        className="min-h-12 w-full rounded-md bg-ws-primary px-4 py-3 text-sm font-medium text-white transition-colors duration-150 hover:bg-ws-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ws-accent disabled:cursor-wait disabled:bg-white/10 disabled:text-ws-muted motion-reduce:transition-none"
      >
        {isPending ? "Mencoba Masuk" : "Masuk"}
      </button>
    </form>
  );
}
