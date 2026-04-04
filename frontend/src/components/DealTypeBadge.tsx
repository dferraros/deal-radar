import { Badge } from "@tremor/react";

interface DealTypeBadgeProps {
  dealType: string | null;
  label?: string;
}

const DEAL_TYPE_COLORS: Record<string, string> = {
  vc: "blue",
  ma: "violet",
  crypto: "amber",
  ipo: "emerald",
};

export default function DealTypeBadge({ dealType, label }: DealTypeBadgeProps) {
  const color = dealType
    ? (DEAL_TYPE_COLORS[dealType.toLowerCase()] ?? "gray")
    : "gray";
  const text = label ?? (dealType ? dealType.toUpperCase() : "—");
  return <Badge color={color as any}>{text}</Badge>;
}
