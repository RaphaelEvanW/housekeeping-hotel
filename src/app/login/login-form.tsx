"use client";

import { useState, type SubmitEvent } from "react";

import { authClient } from "@/lib/auth-client";
import styles from "./login.module.css";

export function LoginForm() {
  const [isPending, setIsPending] = useState(false);
  const [message, setMessage] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isPending) return;

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");

    setIsPending(true);
    setMessage("");

    try {
      const { error } = await authClient.signIn.email({ email, password });

      if (error) {
        setMessage("Login gagal. Periksa email dan kata sandi, lalu coba lagi.");
        return;
      }

      window.location.replace("/dashboard");
    } catch {
      setMessage("Tidak dapat menghubungi server. Coba lagi.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className={styles.form} aria-busy={isPending} aria-describedby={message ? "login-message" : undefined}>
      <div className={styles.field}>
        <label htmlFor="email" className={styles.label}>
          Email
        </label>
        <div className={styles.inputShell}>
        <svg className={styles.fieldIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 6 9 7 9-7" /></svg>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          placeholder="nama@hotel.com"
          autoCapitalize="none"
          spellCheck={false}
          required
          className={styles.input}
        />
        </div>
      </div>

      <div className={styles.field}>
        <label htmlFor="password" className={styles.label}>
          Kata sandi
        </label>
        <div className={styles.inputShell}>
        <svg className={styles.fieldIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v3" /></svg>
        <input
          id="password"
          name="password"
          type={showPassword ? "text" : "password"}
          autoComplete="current-password"
          placeholder="Masukkan kata sandi"
          required
          className={styles.input}
        />
        <button
            type="button"
            onClick={() => setShowPassword((previous) => !previous)}
            aria-controls="password"
            aria-label={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
            className={styles.visibility}
            >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" />{showPassword ? <path d="m3 3 18 18" /> : null}</svg>
        </button>
        </div>
      </div>

      {message ? <p id="login-message" role="alert" className={styles.message}>{message}</p> : null}

      <button
        type="submit"
        disabled={isPending}
        className={styles.submit}
      >
        {isPending ? "Sedang masuk…" : "Masuk"}
        {!isPending ? <svg className={styles.arrow} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M3 12h17m-7-7 7 7-7 7" /></svg> : null}
      </button>
    </form>
  );
}
