import type { RsvpStatus } from "@/lib/scoreboard";

const MESSAGES: Record<RsvpStatus, { text: string; color: string }> = {
  in: { text: "You're In!", color: "bg-emerald-50 border-emerald-300 text-emerald-800" },
  out: { text: "You're Out", color: "bg-red-50 border-red-300 text-red-800" },
  maybe: { text: "Marked as Maybe", color: "bg-sky-50 border-sky-300 text-sky-800" },
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
    <div className={`w-full rounded-lg border px-4 py-3 text-center font-semibold ${msg.color}`}>
      {msg.text}
    </div>
  );
}
