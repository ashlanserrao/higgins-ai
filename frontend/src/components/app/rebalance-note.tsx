import { PiggyBank } from "lucide-react";
import { StatusBadge } from "@/components/badges";
import { inr } from "@/lib/format";
import { cn } from "@/lib/utils";
import { usePlan } from "@/state/planner";

/** What the engine did when accepted quotes differed from the estimates. */
export function RebalanceNote() {
  const { plan } = usePlan();
  const r = plan.rebalance;
  if (!r) return null;
  return (
    <div className={cn("rounded-lg p-4 text-sm", r.over_budget_inr ? "bg-danger-soft" : "bg-surface-soft")}>
      <p className="mb-1 flex flex-wrap items-center gap-2 font-medium">
        {r.over_budget_inr
          ? <StatusBadge tone="danger">Over budget by {inr(r.over_budget_inr)}</StatusBadge>
          : <StatusBadge tone="success" icon={PiggyBank}>Budget adjusted</StatusBadge>}
        What happened when your quotes came in
      </p>
      <p>{r.explanation}</p>
    </div>
  );
}
