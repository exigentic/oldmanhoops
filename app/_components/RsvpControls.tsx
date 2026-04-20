"use client";

import { useState, useRef, useEffect } from "react";
import type { CurrentRsvp, RsvpStatus } from "@/lib/scoreboard";
import { CountCards } from "./CountCards";

export function RsvpControls({
  counts,
  current,
  focusNoteOnMount = false,
  onUpdated,
}: {
  counts: { in: number; out: number; maybe: number };
  current: CurrentRsvp | null;
  focusNoteOnMount?: boolean;
  onUpdated?: () => void;
}) {
  const [status, setStatus] = useState<RsvpStatus | null>(current?.status ?? null);
  const [guests, setGuests] = useState<number>(current?.guests ?? 0);
  const [note, setNote] = useState<string>(current?.note ?? "");
  const initialNoteRef = useRef<string>(current?.note ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [noteState, setNoteState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);
  const noteRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (focusNoteOnMount) noteRef.current?.focus();
  }, [focusNoteOnMount]);

  async function submit(next: {
    status?: RsvpStatus | null;
    guests?: number;
    note?: string;
  }): Promise<boolean> {
    const body = {
      status: next.status ?? status,
      guests: next.guests ?? guests,
      note: (next.note ?? note) || null,
    };
    if (!body.status) return false;

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
        return false;
      }
      onUpdated?.();
      return true;
    } finally {
      setSubmitting(false);
    }
  }

  function selectStatus(next: RsvpStatus) {
    setStatus(next);
    submit({ status: next });
  }

  async function saveNote() {
    if (note === initialNoteRef.current) return;
    setNoteState("saving");
    const ok = await submit({ note });
    if (ok) {
      initialNoteRef.current = note;
      setNoteState("saved");
      setTimeout(() => setNoteState("idle"), 2000);
    } else {
      setNoteState("idle");
    }
  }

  return (
    <section className="flex flex-col gap-4 w-full">
      <CountCards
        counts={counts}
        selected={status}
        onSelect={selectStatus}
        disabled={submitting}
      />
      <div className="flex items-center justify-between">
        <span className="text-sm text-neutral-600">Guests?</span>
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
            className="w-8 h-8 rounded-full bg-neutral-200 text-neutral-900 disabled:opacity-30"
          >
            −
          </button>
          <span aria-label="guests" className="min-w-[1.5rem] text-center font-semibold text-neutral-900">
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
            className="w-8 h-8 rounded-full bg-neutral-200 text-neutral-900 disabled:opacity-30"
          >
            +
          </button>
        </div>
      </div>
      <label className="flex flex-col gap-1 text-sm text-neutral-700">
        <span className="flex items-center justify-between">
          <span>Note</span>
          <span aria-live="polite" className="text-xs">
            {noteState === "saving" && (
              <span className="text-neutral-500">Saving…</span>
            )}
            {noteState === "saved" && (
              <span className="text-emerald-600">Saved ✓</span>
            )}
          </span>
        </span>
        <input
          ref={noteRef}
          type="text"
          maxLength={100}
          value={note}
          aria-label="note"
          onChange={(e) => {
            setNote(e.target.value);
            if (noteState === "saved") setNoteState("idle");
          }}
          onBlur={saveNote}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
          placeholder="e.g., running 15 min late"
          className="rounded-md bg-white border border-neutral-300 px-3 py-2 text-neutral-900"
        />
      </label>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </section>
  );
}
