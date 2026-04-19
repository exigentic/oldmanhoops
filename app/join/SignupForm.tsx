"use client";

import { useState } from "react";

export function SignupForm({ initialCode }: { initialCode: string }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState(initialCode);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

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
        setSuccess(true);
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <p className="text-neutral-200">
        Check your email for a sign-in link.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 w-full max-w-sm">
      <label className="flex flex-col gap-1 text-sm text-neutral-300">
        Name
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="rounded-md bg-neutral-900 border border-neutral-700 px-3 py-2 text-neutral-100"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-neutral-300">
        Email
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="rounded-md bg-neutral-900 border border-neutral-700 px-3 py-2 text-neutral-100"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-neutral-300">
        Access code
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          required
          className="rounded-md bg-neutral-900 border border-neutral-700 px-3 py-2 text-neutral-100"
        />
      </label>
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-amber-400 text-neutral-950 px-4 py-2 font-semibold disabled:opacity-50"
      >
        {submitting ? "Signing up..." : "Sign up"}
      </button>
    </form>
  );
}
