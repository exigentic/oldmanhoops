"use client";

import { useEffect, useRef, useState } from "react";

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
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

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
      <p role="status" className="text-neutral-700 text-sm">
        Check your email for a link or 6-digit code. Paste the code here to
        finish signing in.
      </p>
      <label className="flex flex-col gap-1 text-sm text-neutral-700">
        Code
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          required
          aria-invalid={!!error}
          aria-describedby={error ? "otp-error" : undefined}
          className="rounded-md bg-white border border-neutral-300 px-3 py-2 text-neutral-900 tracking-widest font-mono"
        />
      </label>
      {error && (
        <p id="otp-error" role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-indigo-600 text-white px-4 py-2 font-semibold disabled:opacity-50 hover:bg-indigo-700"
      >
        {submitting ? "Verifying..." : "Verify code"}
      </button>
    </form>
  );
}
