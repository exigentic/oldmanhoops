import type { RosterEntry } from "@/lib/scoreboard";

const ORDER: RosterEntry["status"][] = ["in", "maybe", "out"];
const LABEL: Record<RosterEntry["status"], string> = { in: "In", out: "Out", maybe: "Maybe" };
const HEADING_CLASS: Record<RosterEntry["status"], string> = {
  in: "text-emerald-700",
  maybe: "text-yellow-800",
  out: "text-red-700",
};

export function Roster({ entries }: { entries: RosterEntry[] }) {
  if (entries.length === 0) return null;

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
              {grouped[status].map((e, i) => (
                <li key={`${e.name}-${i}`} className="flex flex-col">
                  <span className="font-medium">
                    {e.name}
                    {e.guests > 0 && <span className="text-neutral-500"> +{e.guests}</span>}
                  </span>
                  {e.note && (
                    <span className="text-xs text-neutral-500 break-words">{e.note}</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )
      )}
    </div>
  );
}
