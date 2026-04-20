"use client";

import { useCallback, useEffect, useRef, useState } from "react";

function useFlashValue<T>(durationMs: number) {
  const [value, setValue] = useState<T | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);
  const flash = useCallback(
    (v: T) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      setValue(v);
      timerRef.current = setTimeout(() => {
        setValue(null);
        timerRef.current = null;
      }, durationMs);
    },
    [durationMs]
  );
  return [value, flash] as const;
}

interface SettingsFormProps {
  initialName: string;
  initialEmail: string;
  initialReminderEmail: boolean;
  initialActive: boolean;
  pendingEmail?: string | null;
}

async function postJson(
  path: string,
  body: Record<string, unknown>
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data.error ?? "Update failed" };
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Network error",
    };
  }
}

export function SettingsForm({
  initialName,
  initialEmail,
  initialReminderEmail,
  initialActive,
  pendingEmail = null,
}: SettingsFormProps) {
  // Name section
  const [name, setName] = useState(initialName);
  const [nameSaving, setNameSaving] = useState(false);
  const [nameSaved, flashNameSaved] = useFlashValue<true>(2000);
  const [nameError, setNameError] = useState<string | null>(null);

  async function saveName() {
    const trimmed = name.trim();
    setName(trimmed);
    setNameSaving(true);
    setNameError(null);
    const r = await postJson("/api/profile", { name: trimmed });
    setNameSaving(false);
    if (r.ok) {
      flashNameSaved(true);
    } else {
      setNameError(r.error ?? "Update failed");
    }
  }

  // Email section
  const [email, setEmail] = useState(initialEmail);
  const [emailSubmitting, setEmailSubmitting] = useState(false);
  const [pendingTarget, setPendingTarget] = useState<string | null>(pendingEmail);
  const [emailError, setEmailError] = useState<string | null>(null);

  async function submitEmail() {
    setEmailSubmitting(true);
    setEmailError(null);
    const r = await postJson("/api/auth/email", { email });
    setEmailSubmitting(false);
    if (r.ok) {
      setPendingTarget(email);
    } else {
      setEmailError(r.error ?? "Update failed");
    }
  }

  // Toggles
  const [reminder, setReminder] = useState(initialReminderEmail);
  const [active, setActive] = useState(initialActive);
  const [toggleSaving, setToggleSaving] = useState<"reminder" | "active" | null>(null);
  const [toggleSaved, flashToggleSaved] = useFlashValue<"reminder" | "active">(2000);
  const [toggleError, setToggleError] = useState<string | null>(null);

  async function toggleField(
    field: "reminder_email" | "active",
    next: boolean
  ) {
    const key = field === "reminder_email" ? "reminder" : "active";
    if (toggleSaving) return; // drop rapid-fire clicks during an in-flight request
    setToggleSaving(key);
    if (field === "reminder_email") setReminder(next);
    else setActive(next);
    setToggleError(null);
    const r = await postJson("/api/profile", { [field]: next });
    setToggleSaving(null);
    if (r.ok) {
      flashToggleSaved(key);
    } else {
      // Revert optimistic state on failure
      if (field === "reminder_email") setReminder(!next);
      else setActive(!next);
      setToggleError(r.error ?? "Update failed");
    }
  }

  return (
    <div className="flex flex-col gap-8 w-full max-w-md">
      {/* Name */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          saveName();
        }}
        className="flex flex-col gap-2"
      >
        <label htmlFor="name" className="text-sm text-neutral-700">
          Display name
        </label>
        <input
          id="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={50}
          autoComplete="name"
          aria-invalid={!!nameError}
          aria-describedby={nameError ? "name-error" : undefined}
          className="rounded-md bg-white border border-neutral-300 px-3 py-2 text-neutral-900"
        />
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={nameSaving || name.trim().length === 0}
            className="rounded-md bg-indigo-600 text-white px-4 py-2 font-semibold disabled:opacity-50 hover:bg-indigo-700"
          >
            {nameSaving ? "Saving…" : "Save name"}
          </button>
          <span aria-live="polite" className="text-sm">
            {nameSaved && <span className="text-emerald-600">Saved ✓</span>}
          </span>
        </div>
        {nameError && (
          <p id="name-error" role="alert" className="text-sm text-red-600">
            {nameError}
          </p>
        )}
      </form>

      {/* Email */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submitEmail();
        }}
        className="flex flex-col gap-2"
      >
        <label htmlFor="email" className="text-sm text-neutral-700">
          Email
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          aria-invalid={!!emailError}
          aria-describedby={emailError ? "email-error" : undefined}
          className="rounded-md bg-white border border-neutral-300 px-3 py-2 text-neutral-900"
        />
        <button
          type="submit"
          disabled={
            emailSubmitting ||
            !email.trim() ||
            email.trim() === initialEmail ||
            email.trim() === pendingTarget
          }
          className="rounded-md bg-indigo-600 text-white px-4 py-2 font-semibold disabled:opacity-50 hover:bg-indigo-700"
        >
          {emailSubmitting ? "Sending…" : "Send confirmation email"}
        </button>
        {pendingTarget && (
          <p className="text-sm text-neutral-600">
            Check your inbox at {pendingTarget} to confirm the change.
          </p>
        )}
        {emailError && (
          <p id="email-error" role="alert" className="text-sm text-red-600">
            {emailError}
          </p>
        )}
      </form>

      {/* Toggles */}
      <div className="flex flex-col gap-3" aria-live="polite">
        <label className="flex items-center gap-2 text-sm text-neutral-700">
          <input
            type="checkbox"
            checked={reminder}
            disabled={toggleSaving !== null}
            onChange={(e) => toggleField("reminder_email", e.target.checked)}
            aria-invalid={!!toggleError}
            aria-describedby={toggleError ? "toggle-error" : undefined}
          />
          Email reminders
          {toggleSaved === "reminder" && (
            <span className="text-emerald-600 text-xs">Saved ✓</span>
          )}
        </label>
        <label className="flex items-center gap-2 text-sm text-neutral-700">
          <input
            type="checkbox"
            checked={active}
            disabled={toggleSaving !== null}
            onChange={(e) => toggleField("active", e.target.checked)}
            aria-invalid={!!toggleError}
            aria-describedby={toggleError ? "toggle-error" : undefined}
          />
          Active (uncheck to leave the group)
          {toggleSaved === "active" && (
            <span className="text-emerald-600 text-xs">Saved ✓</span>
          )}
        </label>
        {toggleError && (
          <p id="toggle-error" role="alert" className="text-sm text-red-600">
            {toggleError}
          </p>
        )}
      </div>
    </div>
  );
}
