"use client";

import { useState } from "react";
import { VerifyOtpForm } from "@/app/_components/VerifyOtpForm";

export function SignupForm({ initialCode }: { initialCode: string }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState(initialCode);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Signup failed");
      } else {
        setSent(true);
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return <VerifyOtpForm email={email} type="invite" />;
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 w-full max-w-sm">
      <label className="flex flex-col gap-1 text-sm text-neutral-700">
        <span className="flex items-baseline gap-2">
          Name
          <span className="text-xs text-neutral-500 font-normal">
            won&apos;t be shown to non-members
          </span>
        </span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          aria-invalid={!!error}
          aria-describedby={error ? "signup-error" : undefined}
          className="rounded-md bg-white border border-neutral-300 px-3 py-2 text-neutral-900"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-neutral-700">
        Email
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          aria-invalid={!!error}
          aria-describedby={error ? "signup-error" : undefined}
          className="rounded-md bg-white border border-neutral-300 px-3 py-2 text-neutral-900"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-neutral-700">
        Access code
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          required
          aria-invalid={!!error}
          aria-describedby={error ? "signup-error" : undefined}
          className="rounded-md bg-white border border-neutral-300 px-3 py-2 text-neutral-900"
        />
      </label>
      {error && (
        <p id="signup-error" role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-indigo-600 text-white px-4 py-2 font-semibold disabled:opacity-50 hover:bg-indigo-700"
      >
        {submitting ? "Signing up..." : "Sign up"}
      </button>
    </form>
  );
}
