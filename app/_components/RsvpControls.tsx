"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { CurrentRsvp, RsvpStatus } from "@/lib/scoreboard";

const STATUSES: { key: RsvpStatus; label: string; activeClass: string }[] = [
  { key: "in", label: "In", activeClass: "bg-emerald-400 text-neutral-950" },
  { key: "out", label: "Out", activeClass: "bg-red-400 text-neutral-950" },
  { key: "maybe", label: "Maybe", activeClass: "bg-amber-400 text-neutral-950" },
];

export function RsvpControls({
  current,
  focusNoteOnMount = false,
}: {
  current: CurrentRsvp | null;
  focusNoteOnMount?: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<RsvpStatus | null>(current?.status ?? null);
  const [guests, setGuests] = useState<number>(current?.guests ?? 0);
  const [note, setNote] = useState<string>(current?.note ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const noteRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (focusNoteOnMount) noteRef.current?.focus();
  }, [focusNoteOnMount]);

  async function submit(next: {
    status?: RsvpStatus | null;
    guests?: number;
    note?: string;
  }) {
    const body = {
      status: next.status ?? status,
      guests: next.guests ?? guests,
      note: (next.note ?? note) || null,
    };
    if (!body.status) return;

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/rsvp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Update failed");
        return;
      }
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="flex flex-col gap-3 w-full max-w-md">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">
        Your RSVP
      </h2>
      <div className="flex gap-2">
        {STATUSES.map((s) => {
          const pressed = status === s.key;
          return (
            <button
              key={s.key}
              type="button"
              aria-pressed={pressed}
              onClick={() => {
                setStatus(s.key);
                submit({ status: s.key });
              }}
              disabled={submitting}
              className={`flex-1 rounded-md border border-neutral-700 px-3 py-2 font-semibold disabled:opacity-50 ${
                pressed ? s.activeClass : "bg-neutral-900 text-neutral-300"
              }`}
            >
              {s.label}
            </button>
          );
        })}
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm text-neutral-400">Bringing guests</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="decrement guests"
            disabled={guests <= 0 || submitting}
            onClick={() => {
              const next = guests - 1;
              setGuests(next);
              submit({ guests: next });
            }}
            className="w-8 h-8 rounded-full bg-neutral-800 text-neutral-100 disabled:opacity-30"
          >
            −
          </button>
          <span aria-label="guests" className="min-w-[1.5rem] text-center font-semibold">
            {guests}
          </span>
          <button
            type="button"
            aria-label="increment guests"
            disabled={guests >= 10 || submitting}
            onClick={() => {
              const next = guests + 1;
              setGuests(next);
              submit({ guests: next });
            }}
            className="w-8 h-8 rounded-full bg-neutral-800 text-neutral-100 disabled:opacity-30"
          >
            +
          </button>
        </div>
      </div>
      <label className="flex flex-col gap-1 text-sm text-neutral-300">
        Note
        <input
          ref={noteRef}
          type="text"
          maxLength={100}
          value={note}
          aria-label="note"
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => submit({ note })}
          placeholder="e.g., running 15 min late"
          className="rounded-md bg-neutral-900 border border-neutral-700 px-3 py-2 text-neutral-100"
        />
      </label>
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
    </section>
  );
}
