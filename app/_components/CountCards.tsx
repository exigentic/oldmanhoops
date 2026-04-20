import type { RsvpStatus } from "@/lib/scoreboard";

type CardConfig = {
  key: RsvpStatus;
  title: string;
  valueClass: string;
  titleClass: string;
  baseClass: string;
  selectedClass: string;
};

const CARDS: CardConfig[] = [
  {
    key: "in",
    title: "In",
    valueClass: "text-emerald-700",
    titleClass: "text-emerald-700",
    baseClass: "bg-emerald-50 border-emerald-200",
    selectedClass: "bg-emerald-100 border-emerald-500 ring-2 ring-emerald-500",
  },
  {
    key: "maybe",
    title: "Maybe",
    valueClass: "text-yellow-700",
    titleClass: "text-yellow-700",
    baseClass: "bg-yellow-50 border-yellow-400",
    selectedClass: "bg-yellow-100 border-yellow-500 ring-2 ring-yellow-500",
  },
  {
    key: "out",
    title: "Out",
    valueClass: "text-red-700",
    titleClass: "text-red-700",
    baseClass: "bg-red-50 border-red-200",
    selectedClass: "bg-red-100 border-red-500 ring-2 ring-red-500",
  },
];

export function CountCards({
  counts,
  selected,
  onSelect,
  disabled = false,
}: {
  counts: { in: number; out: number; maybe: number };
  selected?: RsvpStatus | null;
  onSelect?: (status: RsvpStatus) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex gap-3 w-full">
      {CARDS.map((c) => (
        <Card
          key={c.key}
          config={c}
          value={counts[c.key]}
          selected={selected === c.key}
          onSelect={onSelect}
          disabled={disabled}
        />
      ))}
    </div>
  );
}

function Card({
  config,
  value,
  selected,
  onSelect,
  disabled,
}: {
  config: CardConfig;
  value: number;
  selected: boolean;
  onSelect?: (status: RsvpStatus) => void;
  disabled: boolean;
}) {
  const interactive = !!onSelect;
  const classes = `flex-1 rounded-lg border px-3 py-5 md:py-7 text-center ${
    selected ? config.selectedClass : config.baseClass
  } ${interactive ? "cursor-pointer transition hover:brightness-95 active:scale-[0.98]" : ""} disabled:opacity-60 disabled:cursor-not-allowed`;

  const inner = (
    <>
      <div aria-label={`${config.title} count`} className={`text-3xl md:text-5xl font-bold ${config.valueClass}`}>
        {value}
      </div>
      <div className={`mt-1 text-xs md:text-sm uppercase tracking-wide font-semibold ${config.titleClass}`}>
        {config.title}
      </div>
    </>
  );

  if (interactive) {
    return (
      <button
        type="button"
        aria-pressed={selected}
        disabled={disabled}
        onClick={() => onSelect?.(config.key)}
        className={classes}
      >
        {inner}
      </button>
    );
  }

  return <div className={classes}>{inner}</div>;
}
