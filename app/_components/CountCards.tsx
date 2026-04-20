export function CountCards({
  counts,
}: {
  counts: { in: number; out: number; maybe: number };
}) {
  return (
    <div className="flex gap-3 w-full">
      <Card label="In count" title="In" value={counts.in} accent="bg-emerald-950 border-emerald-800 text-emerald-400" valueClass="text-emerald-400" />
      <Card label="Out count" title="Out" value={counts.out} accent="bg-red-950 border-red-800 text-red-400" valueClass="text-red-400" />
      <Card label="Maybe count" title="Maybe" value={counts.maybe} accent="bg-amber-950 border-amber-800 text-amber-400" valueClass="text-amber-400" />
    </div>
  );
}

function Card({
  label,
  title,
  value,
  accent,
  valueClass,
}: {
  label: string;
  title: string;
  value: number;
  accent: string;
  valueClass: string;
}) {
  return (
    <div className={`flex-1 rounded-lg border px-3 py-5 md:py-7 text-center ${accent}`}>
      <div aria-label={label} className={`text-3xl md:text-5xl font-bold ${valueClass}`}>
        {value}
      </div>
      <div className="mt-1 text-xs md:text-sm uppercase tracking-wide opacity-80">{title}</div>
    </div>
  );
}
