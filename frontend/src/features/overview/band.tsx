// The Overview's header band: the event accent behind the greeting and the four numbers that
// matter. On a desktop it also carries the command bar, Share and Print (the shell's top bar
// steps aside there). The card below overlaps its bottom edge.

import type { ReactNode } from "react";
import { AlertTriangle, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { eventName, formatDate, greeting, inr, plural, weekday } from "@/lib/format";
import { DESKTOP, useMediaQuery } from "@/lib/use-media-query";
import { usePlan } from "@/state/planner";
import { CommandBar } from "@/features/shell/command-bar";
import { ShareButton, usePrint } from "@/features/shell/shell";

/** "12 days / To go", with the edges said in words. */
function countdownStat(days: number): [value: string, label: string] {
  if (days > 1) return [`${days} days`, "To go"];
  if (days === 1) return ["Tomorrow", "1 day to go"];
  if (days === 0) return ["Today", "It's the day"];
  return [`${plural(-days, "day")} ago`, "Happened"];
}

function BandStat({ value, label }: { value: ReactNode; label: ReactNode }) {
  // Label first for screen readers, value first on screen.
  return (
    <div className="flex min-w-0 flex-col-reverse gap-0.5">
      <dt className="flex items-center gap-1 text-xs text-primary-foreground/80">{label}</dt>
      <dd className="num text-xl font-semibold">{value}</dd>
    </div>
  );
}

export function OverviewBand() {
  const { plan, inputs, events, activeId } = usePlan();
  const desktop = useMediaQuery(DESKTOP);
  const print = usePrint();
  const current = events.find((event) => event.id === activeId);
  const [days, daysLabel] = countdownStat(plan.days_remaining);
  const tight = plan.per_guest_inr < plan.floor_per_guest_inr;
  const over = plan.rebalance?.over_budget_inr ?? 0;
  const buffer = plan.budget_lines.find((line) => line.key === "contingency")?.amount_inr ?? 0;

  return (
    <section aria-labelledby="overview-title" className="overview-band -mx-4 px-4 pt-5 pb-[52px] text-primary-foreground md:-mx-10 md:px-10 md:pt-6">
      {desktop && (
        <div className="no-print mb-6 flex items-center gap-2">
          {/* A fresh bar per event, so a half-typed change never applies to another one. */}
          <div className="min-w-0 flex-1"><CommandBar key={activeId} tone="band" /></div>
          <ShareButton tone="band" />
          <Button
            variant="ghost" size="icon" onClick={print} aria-label="Print or save as PDF" title="Print or save as PDF"
            className="text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground dark:hover:bg-primary-foreground/15"
          >
            <Printer aria-hidden="true" />
          </Button>
        </div>
      )}
      <p className="text-xs text-primary-foreground/80">
        {eventName(current ?? { name: "", inputs })} · {weekday(inputs.event_date)}, {formatDate(inputs.event_date)}
      </p>
      <h1 id="overview-title" tabIndex={-1} data-section-title className="mt-1.5 text-[1.625rem] tracking-[-0.02em] outline-none md:text-[1.75rem]">
        {greeting()}.
      </h1>
      <p className="mt-1 text-[13px] text-primary-foreground/85">Your plan, worked out from your numbers.</p>
      <dl className="mt-5 grid grid-cols-2 gap-x-2.5 gap-y-4 min-[900px]:grid-cols-4">
        <BandStat value={days} label={daysLabel} />
        <BandStat value={inr(inputs.budget_inr)} label="Total budget" />
        <BandStat
          value={inr(plan.per_guest_inr)}
          label={tight ? <><AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" /> Per guest, tight</> : "Per guest"}
        />
        <BandStat
          value={over
            ? <span className="inline-flex rounded-full bg-warning-soft px-2.5 py-0.5 text-base text-warning">Over by {inr(over)}</span>
            : inr(buffer)}
          label="Buffer"
        />
      </dl>
    </section>
  );
}
