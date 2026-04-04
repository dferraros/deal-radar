interface DealTypeBadgeProps {
  dealType: string | null;
  label?: string;
}

const colors: Record<string, string> = {
  vc: 'border-l-2 border-blue-500 text-blue-400 pl-1.5',
  ma: 'border-l-2 border-violet-500 text-violet-400 pl-1.5',
  crypto: 'border-l-2 border-amber-500 text-amber-400 pl-1.5',
  ipo: 'border-l-2 border-emerald-500 text-emerald-400 pl-1.5',
  unknown: 'border-l-2 border-slate-500 text-slate-400 pl-1.5',
};

export default function DealTypeBadge({ dealType, label }: DealTypeBadgeProps) {
  const type = dealType?.toLowerCase() ?? 'unknown';
  const colorClass = colors[type] ?? colors.unknown;
  const text = label ?? (dealType ? dealType.toUpperCase() : '—');
  return (
    <span className={`text-xs font-mono uppercase ${colorClass}`}>
      {text}
    </span>
  );
}
