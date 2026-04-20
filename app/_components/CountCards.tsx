export function CountCards({
  counts,
}: {
  counts: { in: number; out: number; maybe: number };
}) {
  return (
    <div className="flex gap-3 w-full">
      <Card
        label="In count"
        title="In"
        value={counts.in}
        accent="bg-emerald-50 border-emerald-200"
        valueClass="text-emerald-700"
        titleClass="text-emerald-700"
      />
      <Card
        label="Out count"
        title="Out"
        value={counts.out}
        accent="bg-red-50 border-red-200"
        valueClass="text-red-700"
        titleClass="text-red-700"
      />
      <Card
        label="Maybe count"
        title="Maybe"
        value={counts.maybe}
        accent="bg-sky-50 border-sky-200"
        valueClass="text-sky-700"
        titleClass="text-sky-700"
      />
    </div>
  );
}

function Card({
  label,
  title,
  value,
  accent,
  valueClass,
  titleClass,
}: {
  label: string;
  title: string;
  value: number;
  accent: string;
  valueClass: string;
  titleClass: string;
}) {
  return (
    <div className={`flex-1 rounded-lg border px-3 py-5 md:py-7 text-center ${accent}`}>
      <div aria-label={label} className={`text-3xl md:text-5xl font-bold ${valueClass}`}>
        {value}
      </div>
      <div className={`mt-1 text-xs md:text-sm uppercase tracking-wide font-semibold ${titleClass}`}>
        {title}
      </div>
    </div>
  );
}
