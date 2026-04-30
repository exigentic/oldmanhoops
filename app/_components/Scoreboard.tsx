"use client";

import { useCallback, useEffect, useState } from "react";
import type { ScoreboardData, RsvpStatus } from "@/lib/scoreboard";
import { formatGameDate } from "@/lib/date";
import { CountCards } from "./CountCards";
import { Roster } from "./Roster";
import { RsvpControls } from "./RsvpControls";
import { ConfirmationBanner } from "./ConfirmationBanner";

const POLL_MS = 30_000;

export function Scoreboard({
  initial,
  viewDate,
  isLive,
  urlStatus = null,
  focusNoteOnMount = false,
  isAdmin = false,
  currentUserId = null,
}: {
  initial: ScoreboardData;
  viewDate: string;
  isLive: boolean;
  urlStatus?: string | null;
  focusNoteOnMount?: boolean;
  isAdmin?: boolean;
  currentUserId?: string | null;
}) {
  const [data, setData] = useState<ScoreboardData>(initial);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/scoreboard?date=${viewDate}`, { cache: "no-store" });
      if (!res.ok) return;
      const next = (await res.json()) as ScoreboardData;
      setData(next);
    } catch {
      // ignore transient fetch errors
    }
  }, [viewDate]);

  const setPlayerStatus = useCallback(
    async (playerId: string, next: RsvpStatus) => {
      const res = await fetch("/api/admin/rsvp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ player_id: playerId, status: next, game_date: viewDate }),
      });
      if (!res.ok) {
        throw new Error(`admin rsvp failed: ${res.status}`);
      }
      await refresh();
    },
    [refresh, viewDate]
  );

  useEffect(() => {
    if (!isLive) return;
    function tickIfVisible() {
      if (document.visibilityState === "visible") refresh();
    }
    const id = setInterval(tickIfVisible, POLL_MS);
    document.addEventListener("visibilitychange", tickIfVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tickIfVisible);
    };
  }, [refresh, isLive]);

  if (data.state === "no-game") {
    return (
      <div className="text-center text-neutral-600">
        <p className="text-lg">No game on {formatGameDate(viewDate)}.</p>
      </div>
    );
  }

  if (data.state === "cancelled") {
    return (
      <div className="text-center">
        <p className="text-lg text-red-700 font-semibold">
          Game cancelled — {formatGameDate(viewDate)}
        </p>
        {data.reason && <p className="text-sm text-neutral-600 mt-1">{data.reason}</p>}
      </div>
    );
  }

  const isMember = data.roster !== null;
  const adminProps =
    isAdmin && currentUserId
      ? { currentUserId, onSetStatus: setPlayerStatus }
      : undefined;
  const nonRespondersProps = isAdmin ? data.nonResponders ?? undefined : undefined;
  const rosterIsNonEmpty = !!data.roster && data.roster.length > 0;
  const renderRoster =
    rosterIsNonEmpty || (!!nonRespondersProps && nonRespondersProps.length > 0);

  return (
    <div className="flex flex-col w-full gap-6" aria-live="polite" aria-atomic="false">
      {isMember && isLive && (
        <ConfirmationBanner
          urlStatus={urlStatus}
          actualStatus={(data.currentUserRsvp?.status as RsvpStatus) ?? null}
        />
      )}
      {isMember ? (
        <div className="flex flex-col gap-6">
          {isLive ? (
            <RsvpControls
              counts={data.counts}
              current={data.currentUserRsvp}
              viewDate={viewDate}
              focusNoteOnMount={focusNoteOnMount}
              onUpdated={refresh}
            />
          ) : (
            <CountCards counts={data.counts} />
          )}
          {renderRoster && (
            <Roster
              entries={data.roster ?? []}
              admin={adminProps}
              nonResponders={nonRespondersProps}
            />
          )}
        </div>
      ) : (
        <CountCards counts={data.counts} />
      )}
    </div>
  );
}
