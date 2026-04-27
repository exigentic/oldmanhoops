"use client";

import { useState } from "react";
import type { RosterEntry, RsvpStatus } from "@/lib/scoreboard";

const ORDER: RosterEntry["status"][] = ["in", "maybe", "out"];
const LABEL: Record<RosterEntry["status"], string> = { in: "In", out: "Out", maybe: "Maybe" };
const HEADING_CLASS: Record<RosterEntry["status"], string> = {
  in: "text-emerald-700",
  maybe: "text-yellow-800",
  out: "text-red-700",
};

const STATUSES: RsvpStatus[] = ["in", "maybe", "out"];
const STATUS_GLYPH: Record<RsvpStatus, string> = { in: "✓", maybe: "?", out: "✗" };
const STATUS_FILLED: Record<RsvpStatus, string> = {
  in: "bg-emerald-600 text-white",
  maybe: "bg-yellow-500 text-white",
  out: "bg-red-600 text-white",
};
const STATUS_OUTLINED: Record<RsvpStatus, string> = {
  in: "bg-white border border-emerald-400 text-emerald-700",
  maybe: "bg-white border border-yellow-400 text-yellow-800",
  out: "bg-white border border-red-400 text-red-700",
};

type AdminMode = {
  currentUserId: string;
  onSetStatus: (playerId: string, next: RsvpStatus) => Promise<void>;
};

function StatusCluster({
  playerName,
  current,
  disabled,
  onSelect,
}: {
  playerName: string;
  current: RsvpStatus | null;
  disabled: boolean;
  onSelect: (next: RsvpStatus) => void;
}) {
  return (
    <div className="shrink-0 flex gap-1.5" role="group" aria-label={`Set ${playerName}'s RSVP`}>
      {STATUSES.map((s) => {
        const filled = current === s;
        const cls = filled ? STATUS_FILLED[s] : STATUS_OUTLINED[s];
        return (
          <button
            key={s}
            type="button"
            aria-label={`Set ${playerName} to ${s}`}
            aria-pressed={filled}
            disabled={disabled}
            onClick={() => onSelect(s)}
            className={`w-8 h-8 rounded-full text-sm font-bold grid place-items-center disabled:opacity-50 disabled:cursor-not-allowed ${cls}`}
          >
            {STATUS_GLYPH[s]}
          </button>
        );
      })}
    </div>
  );
}

function AdminRow({
  playerId,
  name,
  guests,
  note,
  current,
  showButtons,
  muted = false,
  onSetStatus,
}: {
  playerId: string;
  name: string;
  guests: number;
  note: string | null;
  current: RsvpStatus | null;
  showButtons: boolean;
  muted?: boolean;
  onSetStatus?: (playerId: string, next: RsvpStatus) => Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handle(next: RsvpStatus) {
    if (!onSetStatus) return;
    setPending(true);
    setError(null);
    try {
      await onSetStatus(playerId, next);
    } catch {
      setError("Failed — please try again");
    } finally {
      setPending(false);
    }
  }

  return (
    <li className="flex items-start justify-between gap-3">
      <div className="flex flex-col">
        <span className={`font-medium${muted ? " text-neutral-700" : ""}`}>
          {name}
          {guests > 0 && <span className="text-neutral-600"> +{guests}</span>}
        </span>
        {note && <span className="text-xs text-neutral-600 break-words">{note}</span>}
        {error && (
          <span role="alert" className="text-xs text-red-600">
            {error}
          </span>
        )}
      </div>
      {showButtons && onSetStatus && (
        <StatusCluster
          playerName={name}
          current={current}
          disabled={pending}
          onSelect={handle}
        />
      )}
    </li>
  );
}

export function Roster({
  entries,
  admin,
  nonResponders,
}: {
  entries: RosterEntry[];
  admin?: AdminMode;
  nonResponders?: { playerId: string; name: string }[];
}) {
  const hasGroups = entries.length > 0;
  const hasNonResponders = !!admin && !!nonResponders && nonResponders.length > 0;
  if (!hasGroups && !hasNonResponders) return null;

  const grouped: Record<RosterEntry["status"], RosterEntry[]> = { in: [], maybe: [], out: [] };
  for (const e of entries) grouped[e.status].push(e);

  return (
    <div className="flex flex-col gap-4 w-full">
      {ORDER.map((status) =>
        grouped[status].length === 0 ? null : (
          <section key={status} aria-labelledby={`roster-${status}`}>
            <h2
              id={`roster-${status}`}
              className={`text-sm font-semibold uppercase tracking-wide mb-2 ${HEADING_CLASS[status]}`}
            >
              {LABEL[status]}
            </h2>
            <ul className="flex flex-col gap-2 text-neutral-900">
              {grouped[status].map((e) => (
                <AdminRow
                  key={e.playerId}
                  playerId={e.playerId}
                  name={e.name}
                  guests={e.guests}
                  note={e.note}
                  current={e.status}
                  showButtons={!!admin && e.playerId !== admin.currentUserId}
                  onSetStatus={admin?.onSetStatus}
                />
              ))}
            </ul>
          </section>
        )
      )}

      {hasNonResponders && (
        <section
          aria-labelledby="roster-not-yet-responded"
          className={hasGroups ? "mt-2 pt-4 border-t border-neutral-200" : undefined}
        >
          <h2
            id="roster-not-yet-responded"
            className="text-sm font-semibold uppercase tracking-wide mb-2 text-neutral-500"
          >
            Not yet responded
          </h2>
          <ul className="flex flex-col gap-2 text-neutral-900">
            {nonResponders?.map((n) => (
              <AdminRow
                key={n.playerId}
                playerId={n.playerId}
                name={n.name}
                guests={0}
                note={null}
                current={null}
                showButtons={n.playerId !== admin?.currentUserId}
                muted
                onSetStatus={admin?.onSetStatus}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
