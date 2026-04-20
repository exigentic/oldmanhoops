"use client";

import { useState } from "react";
import { VerifyOtpForm } from "@/app/_components/VerifyOtpForm";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setSent(true);
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return <VerifyOtpForm email={email} type="email" />;
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 w-full max-w-sm">
      <label className="flex flex-col gap-1 text-sm text-neutral-700">
        Email
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="rounded-md bg-white border border-neutral-300 px-3 py-2 text-neutral-900"
        />
      </label>
      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-indigo-600 text-white px-4 py-2 font-semibold disabled:opacity-50 hover:bg-indigo-700"
      >
        {submitting ? "Sending..." : "Send sign-in link"}
      </button>
    </form>
  );
}
