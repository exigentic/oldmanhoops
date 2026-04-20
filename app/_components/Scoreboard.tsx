"use client";

import { useEffect, useState } from "react";
import type { ScoreboardData } from "@/lib/scoreboard";
import { CountCards } from "./CountCards";
import { Roster } from "./Roster";

const POLL_MS = 30_000;

export function Scoreboard({ initial }: { initial: ScoreboardData }) {
  const [data, setData] = useState<ScoreboardData>(initial);

  useEffect(() => {
    let active = true;
    async function tick() {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/scoreboard", { cache: "no-store" });
        if (!res.ok) return;
        const next = (await res.json()) as ScoreboardData;
        if (active) setData(next);
      } catch {
        // ignore transient fetch errors
      }
    }
    const id = setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      active = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);

  if (data.state === "no-game") {
    return (
      <div className="text-center text-neutral-400">
        <p className="text-lg">No game today.</p>
      </div>
    );
  }

  if (data.state === "cancelled") {
    return (
      <div className="text-center">
        <p className="text-lg text-red-400 font-semibold">Game cancelled</p>
        {data.reason && <p className="text-sm text-neutral-400 mt-1">{data.reason}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6">
      <CountCards counts={data.counts} />
      {data.roster && <Roster entries={data.roster} />}
    </div>
  );
}
