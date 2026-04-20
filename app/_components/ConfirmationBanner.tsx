import type { RsvpStatus } from "@/lib/scoreboard";

const MESSAGES: Record<RsvpStatus, { text: string; color: string }> = {
  in: { text: "You're In!", color: "bg-emerald-950 border-emerald-800 text-emerald-300" },
  out: { text: "You're Out", color: "bg-red-950 border-red-800 text-red-300" },
  maybe: { text: "Marked as Maybe", color: "bg-amber-950 border-amber-800 text-amber-300" },
};

export function ConfirmationBanner({
  urlStatus,
  actualStatus,
}: {
  urlStatus: string | null;
  actualStatus: RsvpStatus | null;
}) {
  if (!urlStatus || !actualStatus || urlStatus !== actualStatus) return null;
  const msg = MESSAGES[actualStatus];
  return (
    <div className={`w-full max-w-md rounded-lg border px-4 py-3 text-center font-semibold ${msg.color}`}>
      {msg.text}
    </div>
  );
}
