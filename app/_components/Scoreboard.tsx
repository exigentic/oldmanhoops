"use client";

import { useCallback, useEffect, useState } from "react";
import type { ScoreboardData, RsvpStatus } from "@/lib/scoreboard";
import { CountCards } from "./CountCards";
import { Roster } from "./Roster";
import { RsvpControls } from "./RsvpControls";
import { ConfirmationBanner } from "./ConfirmationBanner";

const POLL_MS = 30_000;

export function Scoreboard({
  initial,
  urlStatus = null,
  focusNoteOnMount = false,
}: {
  initial: ScoreboardData;
  urlStatus?: string | null;
  focusNoteOnMount?: boolean;
}) {
  const [data, setData] = useState<ScoreboardData>(initial);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/scoreboard", { cache: "no-store" });
      if (!res.ok) return;
      const next = (await res.json()) as ScoreboardData;
      setData(next);
    } catch {
      // ignore transient fetch errors
    }
  }, []);

  useEffect(() => {
    function tickIfVisible() {
      if (document.visibilityState === "visible") refresh();
    }
    const id = setInterval(tickIfVisible, POLL_MS);
    document.addEventListener("visibilitychange", tickIfVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tickIfVisible);
    };
  }, [refresh]);

  if (data.state === "no-game") {
    return (
      <div className="text-center text-neutral-600">
        <p className="text-lg">No game today.</p>
      </div>
    );
  }

  if (data.state === "cancelled") {
    return (
      <div className="text-center">
        <p className="text-lg text-red-700 font-semibold">Game cancelled</p>
        {data.reason && <p className="text-sm text-neutral-600 mt-1">{data.reason}</p>}
      </div>
    );
  }

  const isMember = data.roster !== null;

  return (
    <div className="flex flex-col w-full gap-6" aria-live="polite" aria-atomic="false">
      {isMember && (
        <ConfirmationBanner
          urlStatus={urlStatus}
          actualStatus={(data.currentUserRsvp?.status as RsvpStatus) ?? null}
        />
      )}
      {isMember ? (
        <div className="flex flex-col md:flex-row gap-6 md:items-start">
          <div className={data.roster && data.roster.length > 0 ? "md:w-1/2" : "w-full"}>
            <RsvpControls
              counts={data.counts}
              current={data.currentUserRsvp}
              focusNoteOnMount={focusNoteOnMount}
              onUpdated={refresh}
            />
          </div>
          {data.roster && data.roster.length > 0 && (
            <div className="md:w-1/2">
              <Roster entries={data.roster} />
            </div>
          )}
        </div>
      ) : (
        <CountCards counts={data.counts} />
      )}
    </div>
  );
}
