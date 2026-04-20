"use client";

import { useState } from "react";

type VerifyType = "invite" | "email";

export function VerifyOtpForm({
  email,
  type,
}: {
  email: string;
  type: VerifyType;
}) {
  const [token, setToken] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, token, type }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Invalid code");
      } else {
        window.location.href = "/";
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 w-full max-w-sm">
      <p className="text-neutral-200 text-sm">
        Check your email for a link or 6-digit code. Paste the code here to
        finish signing in.
      </p>
      <label className="flex flex-col gap-1 text-sm text-neutral-300">
        Code
        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          required
          className="rounded-md bg-neutral-900 border border-neutral-700 px-3 py-2 text-neutral-100 tracking-widest font-mono"
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-amber-400 text-neutral-950 px-4 py-2 font-semibold disabled:opacity-50"
      >
        {submitting ? "Verifying..." : "Verify code"}
      </button>
    </form>
  );
}
