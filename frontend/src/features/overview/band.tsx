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
    <div className="flex min-w-0 flex-col-reverse justify-end gap-1">
      <dt className="flex flex-wrap items-center gap-1.5 text-sm text-primary-foreground/80">{label}</dt>
      {/* Sized by the content column, not the window, since the sidebar takes part of it. */}
      <dd className="num text-[clamp(28px,2.4cqw+10px,44px)] leading-tight font-semibold tracking-[-0.02em] whitespace-nowrap">{value}</dd>
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
    <section aria-labelledby="overview-title" className="overview-band pt-5 pb-[52px] text-primary-foreground md:pt-6">
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
      <h1 id="overview-title" tabIndex={-1} data-section-title className="mt-1.5 text-[clamp(26px,1.8cqw+10px,36px)] leading-tight tracking-[-0.02em] outline-none">
        {greeting()}.
      </h1>
      <p className="mt-1 text-[13px] text-primary-foreground/85">Your plan, worked out from your numbers.</p>
      {/* Four across once the column has room for the longest figures (₹80,00,000), two by two before. */}
      <dl className="mt-5 grid grid-cols-2 gap-x-2.5 gap-y-4 @min-[900px]:grid-cols-4">
        <BandStat value={days} label={daysLabel} />
        <BandStat value={inr(inputs.budget_inr)} label="Total budget" />
        <BandStat
          value={inr(plan.per_guest_inr)}
          label={tight ? <><AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" /> Per guest, tight</> : "Per guest"}
        />
        {/* Over budget, the buffer is gone: the overspend takes its place, flagged in a warning chip
            (warning text on the band itself wouldn't be readable). */}
        {over ? (
          <BandStat
            value={inr(over)}
            label={<span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 font-semibold text-warning"><AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" /> Over budget by</span>}
          />
        ) : (
          <BandStat value={inr(buffer)} label="Buffer" />
        )}
      </dl>
    </section>
  );
}
