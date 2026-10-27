// The foot of the Overview card: where the budget goes as one stacked bar, and a line on what
// the engine last moved (money shifted when a quote came in), if anything.

import { ArrowRight, PiggyBank } from "lucide-react";
import { Button } from "@/components/ui/button";
import { inr } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useNav } from "@/state/nav";
import { usePlan } from "@/state/planner";

interface Segment {
  label: string;
  amount: number;
  tone: string; // a background utility, shared by the bar and the legend's swatch
}

const SMALL_SHARE = 0.05; // lines under 5% fold into "Other"

/** Biggest first: the largest in the accent, the next a lighter tint of it, the rest neutral;
 *  the small ones folded together, and the buffer last in green. */
function segments(lines: { key: string; label: string; amount_inr: number }[]): Segment[] {
  const buffer = lines.find((line) => line.key === "contingency");
  const spend = lines.filter((line) => line !== buffer && line.amount_inr > 0).sort((a, b) => b.amount_inr - a.amount_inr);
  const total = lines.reduce((sum, line) => sum + Math.max(0, line.amount_inr), 0);
  const small = spend.filter((line) => line.amount_inr < total * SMALL_SHARE);
  const shown = small.length > 1 ? spend.filter((line) => !small.includes(line)) : spend;
  const tones = ["bg-primary", "bg-primary/55"];
  const list: Segment[] = shown.map((line, index) => ({ label: line.label, amount: line.amount_inr, tone: tones[index] ?? "bg-muted-foreground/35" }));
  if (small.length > 1) list.push({ label: "Other", amount: small.reduce((sum, line) => sum + line.amount_inr, 0), tone: "bg-muted-foreground/20" });
  if (buffer && buffer.amount_inr > 0) list.push({ label: "Buffer", amount: buffer.amount_inr, tone: "bg-success" });
  return list;
}

export function BudgetBlock() {
  const { plan, inputs } = usePlan();
  const { go } = useNav();
  const parts = segments(plan.budget_lines);
  const note = plan.rebalance && !plan.rebalance.over_budget_inr ? plan.rebalance.explanation : "";

  return (
    <div className="mt-4 border-t pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-sans text-[13px] font-medium">Where your {inr(inputs.budget_inr)} goes</h2>
        <Button size="sm" variant="link" className="no-print h-auto px-0 max-md:min-h-11 pointer-coarse:min-h-11" onClick={() => go("budget")}>
          Open budget <ArrowRight aria-hidden="true" />
        </Button>
      </div>
      <div
        role="img"
        aria-label={`Budget split: ${parts.map((p) => `${p.label} ${inr(p.amount)}`).join(", ")}.`}
        className="mt-2.5 flex h-2.5 gap-[2px] overflow-hidden rounded-full"
      >
        {parts.map((part) => (
          <span key={part.label} className={cn("h-full min-w-[2px] basis-0", part.tone)} style={{ flexGrow: part.amount }} />
        ))}
      </div>
      {/* Each figure is named in words: the colour only repeats it. */}
      <ul className="num mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-hidden="true">
        {parts.map((part) => (
          <li key={part.label} className="flex items-center gap-1.5">
            <span className={cn("size-2 shrink-0 rounded-[2px]", part.tone)} />
            {part.label} {inr(part.amount)}
          </li>
        ))}
      </ul>
      {note && (
        <p className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground">
          <PiggyBank className="mt-px size-3.5 shrink-0 text-success" aria-hidden="true" /> {note}
        </p>
      )}
    </div>
  );
}
