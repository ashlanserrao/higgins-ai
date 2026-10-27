// Overview: the next step, what changed, the key numbers, the budget at a glance and
// what's coming up. Every card is built from the engine's plan; AI text is labelled.

import { useState, type ReactNode } from "react";
import {
  AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, Compass, GitBranch, Info, Lightbulb, MessageSquareText, Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AiBadge, AiNote, EngineBadge, Panel, Stat, StatusBadge } from "@/components/common";
import { MessageDialog } from "@/components/message-dialog";
import { formatDate, inr, LEVEL_LABELS, plural, signedInr, weekday } from "@/lib/format";
import { canMessage, taskLabel, taskLine, taskShortName } from "@/lib/tasks";
import type { ChecklistItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useNav } from "@/state/nav";
import { usePlan } from "@/state/planner";
import { RebalanceNote } from "@/components/rebalance-note";
import { IdeasStatusLine } from "@/components/ideas-status-line";
import { BookingDialog, type BookingTarget } from "@/components/booking-dialog";
import { OverviewBand } from "./band";
import { BudgetBlock } from "./budget-block";
import { OverviewCard } from "./card";
import { NextStepBadge, NextStepPanel, useNextStep } from "./next-step-panel";
import { QuickActions } from "./quick-actions";

const list = (names: string[]) =>
  names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

/** Badge, serif headline, one sentence of why, a quiet detail line, then the action. */
function ActionCard({ tone, badge, title, detail, children, footer }: {
  tone: "danger" | "warning"; badge: string; title: string; detail?: ReactNode; children?: ReactNode; footer?: ReactNode;
}) {
  return (
    <article className={cn(
      "flex flex-col rounded-xl p-5 transition-[box-shadow,transform] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-raised",
      tone === "danger" ? "bg-danger-soft/60" : "bg-warning-soft/70",
    )}>
      <StatusBadge tone={tone} icon={tone === "danger" ? AlertTriangle : Info} className="self-start bg-surface/80">{badge}</StatusBadge>
      <h3 className="mt-3 text-lg">{title}</h3>
      {children && <p className="mt-1 text-sm text-muted-foreground">{children}</p>}
      {detail && <p className="mt-2 text-xs text-muted-foreground">{detail}</p>}
      {footer && <div className="no-print mt-auto flex flex-wrap items-center gap-2 pt-5">{footer}</div>}
    </article>
  );
}

/** The Overview's next steps before the band-and-card redesign; kept for reuse. */
export function NextSteps() {
  const { plan, inputs, ideas, ideasStatus } = usePlan();
  const { go } = useNav();
  const [booking, setBooking] = useState<BookingTarget | null>(null);
  const [messageFor, setMessageFor] = useState<string | null>(null);
  const [messageOpen, setMessageOpen] = useState(false);
  const message = (id: string) => { setMessageFor(id); setMessageOpen(true); };

  const byId = new Map(plan.checklist.map((i) => [i.id, i]));
  const delays = plan.checklist.filter((i) => i.delayed_by === i.id && !i.done);
  const bookToday = plan.triage.book_today.map((id) => byId.get(id)).filter((i): i is ChecklistItem => Boolean(i && !i.done));
  const thisWeek = plan.checklist.filter((i) => !i.done && i.status === "tight" && !i.at_risk && !i.waiting_on.length);
  const over = plan.rebalance?.over_budget_inr ?? 0;
  const lineAmount = (taskId: string) => {
    const key = taskLine(inputs.event_type, taskId);
    return plan.budget_lines.find((l) => l.key === key)?.amount_inr;
  };

  // Only the first card gets the filled button: one primary action per screen.
  const cards: ((primary: boolean) => ReactNode)[] = [];
  if (over > 0)
    cards.push(() => (
      <ActionCard key="over" tone="danger" badge="Over budget" title={`Your confirmed costs are ${inr(over)} over budget`}
        footer={<QuickActions suggestedBudget={inputs.budget_inr + over} />}>
        The buffer is used up and other lines have been trimmed as far as they sensibly go. Raising the budget or
        swapping a quote fixes it.
      </ActionCard>
    ));
  for (const item of delays) {
    const knockOn = plan.checklist.filter((i) => i.delayed_by === item.id && i.id !== item.id).map((i) => taskShortName(i.label));
    cards.push((primary) => (
      <ActionCard key={item.id} tone="warning" badge="Heads up: this changes a few things"
        title={`Your ${taskShortName(item.label)} can confirm from ${formatDate(item.expected_on!)}`}
        detail={item.at_risk ? `That's after its usual book-by date of ${formatDate(item.book_by)}.` : undefined}
        footer={
          <>
            {canMessage(item.id) && (
              <Button size="sm" variant={primary ? "default" : "outline"} onClick={() => message(item.id)}>
                <MessageSquareText aria-hidden="true" /> Message the vendor
              </Button>
            )}
            <Button size="sm" variant="link" onClick={() => go("tasks")}>See what changes <ArrowRight aria-hidden="true" /></Button>
          </>
        }>
        {knockOn.length
          ? `This affects the ${list(knockOn)}, which wait on it. A quick message might bring it forward.`
          : "Nothing else waits on it, so the rest of your plan stays as it is."}
      </ActionCard>
    ));
  }
  for (const item of bookToday.slice(0, 3)) {
    const amount = lineAmount(item.id);
    cards.push((primary) => (
      <ActionCard key={item.id} tone="danger" badge="Do this today" title={item.label}
        detail={<>{item.book_by < plan.today ? `Usually booked by ${formatDate(item.book_by)}` : `Book by ${formatDate(item.book_by)}`}
          {amount !== undefined && <> · Planned budget <span className="num font-medium text-foreground">{inr(amount)}</span></>}</>}
        footer={
          <>
            <Button size="sm" variant={primary ? "default" : "outline"} onClick={() => setBooking({ taskId: item.id, state: "booked" })}>
              <CheckCircle2 aria-hidden="true" /> Mark booked
            </Button>
            {canMessage(item.id) && (
              <Button size="sm" variant="link" onClick={() => message(item.id)}>Draft an enquiry (2 min)</Button>
            )}
          </>
        }>
        This is usually booked about {item.lead_days} days ahead, and less than half that time is
        left{item.essential ? ". It's one of the essentials" : ""}.
      </ActionCard>
    ));
  }
  if (thisWeek.length && cards.length < 4)
    cards.push((primary) => (
      <ActionCard key="week" tone="warning" badge="This week" title={`Book the ${list(thisWeek.map((i) => taskShortName(i.label)))} this week`}
        footer={<Button size="sm" variant={primary ? "default" : "outline"} onClick={() => go("tasks")}>Open tasks <ArrowRight aria-hidden="true" /></Button>}>
        Still very doable, but you're inside the usual booking window now.
      </ActionCard>
    ));

  const urgent = bookToday.length + delays.length + (over > 0 ? 1 : 0);
  const next = plan.checklist.find((i) => !i.done);

  return (
    <Panel title="Your next step" icon={Compass} description="Just the few things that need you, most urgent first.">
      <p className="mb-5">
        {urgent ? (
          <StatusBadge tone="warning" className="px-3 py-1 text-sm font-medium whitespace-normal">
            {plural(urgent, "thing needs", "things need")} you today. Each one takes a few minutes.
          </StatusBadge>
        ) : thisWeek.length ? (
          <StatusBadge tone="warning" className="px-3 py-1 text-sm font-medium whitespace-normal">
            You're on track. Book the {taskShortName(thisWeek[0].label)} this week to stay there.
          </StatusBadge>
        ) : (
          <StatusBadge tone="success" className="px-3 py-1 text-sm font-medium whitespace-normal">
            You're on track{next ? `. Next up: the ${taskShortName(next.label)}, by ${formatDate(next.book_by)}` : ". Everything is booked"}.
          </StatusBadge>
        )}
      </p>
      {cards.length > 0 && <div className="grid gap-5 md:grid-cols-2">{cards.map((card, index) => card(index === 0))}</div>}
      {plan.triage.active && plan.triage.cut_suggestions.length > 0 && (
        <div className="mt-5 rounded-lg bg-surface-soft p-4 text-sm">
          <p className="font-medium">If time or money gets tight</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">{plan.triage.cut_suggestions.map((c) => <li key={c}>{c}</li>)}</ul>
        </div>
      )}
      {plan.triage.active && ideas?.triage_advice && ideasStatus === "ready" && (
        <div className="mt-5 rounded-lg bg-ai-soft p-4 text-sm ring-1 ring-ai-border">
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2"><AiBadge>A thought from AI</AiBadge><AiNote /></div>
          <p>{ideas.triage_advice}</p>
        </div>
      )}
      {plan.warnings.length > 0 && (
        <details className="mt-5 text-sm">
          <summary className="cursor-pointer font-medium">All notes on your plan ({plan.warnings.length})</summary>
          <ul className="mt-2 space-y-1.5">{plan.warnings.map((w) => <li key={w} className="flex gap-2"><Info className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />{w}</li>)}</ul>
        </details>
      )}
      <BookingDialog target={booking} onClose={() => setBooking(null)} />
      <MessageDialog taskId={messageFor} open={messageOpen} onOpenChange={setMessageOpen} />
    </Panel>
  );
}

/** Not on the Overview since the band-and-card redesign; kept for reuse (see the report). */
export function WhatMoved() {
  const { plan, lastChange } = usePlan();
  const { go } = useNav();
  const knockOn = plan.checklist.filter((i) => i.delayed_by && i.delayed_by !== i.id && !i.done);
  const moved = knockOn.length > 0 || plan.rebalance || lastChange;

  return (
    <Panel title="What changed" icon={GitBranch} actions={<EngineBadge />}
      description="When a vendor slips, a quote comes in or your numbers change, here's what moved.">
      {!moved && <p className="text-sm text-muted-foreground">Nothing has moved yet. When something changes, you'll see the ripple here.</p>}
      {lastChange && (
        <div className="mb-4 rounded-lg bg-surface-soft p-4 text-sm">
          <p className="font-medium">You changed: {lastChange.label}</p>
          {lastChange.summary.length > 0 && <ul className="mt-1 text-muted-foreground">{lastChange.summary.map((s) => <li key={s}>{s}</li>)}</ul>}
        </div>
      )}
      {knockOn.length > 0 && (
        <ul className="mb-4 space-y-2">
          {knockOn.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center gap-3 rounded-lg bg-surface-soft p-4">
              <CalendarClock className="size-4 text-warning" aria-hidden="true" />
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-medium">{item.label}</p>
                <p className="text-muted-foreground">
                  Now {formatDate(item.expected_on!)}, because the {taskShortName(taskLabel(plan, item.delayed_by!))} moved
                  {item.at_risk && <>. It was due by {formatDate(item.book_by)}</>}.
                </p>
              </div>
              {item.at_risk ? <StatusBadge tone="danger">At risk</StatusBadge> : <StatusBadge tone="warning">Moved</StatusBadge>}
            </li>
          ))}
        </ul>
      )}
      <RebalanceNote />
      {knockOn.length > 0 && (
        <Button size="sm" variant="link" className="no-print mt-3 px-0" onClick={() => go("tasks")}>See all bookings <ArrowRight aria-hidden="true" /></Button>
      )}
    </Panel>
  );
}

/** Not on the Overview since the band-and-card redesign; kept for reuse. */
export function IdeasTeaser() {
  const { ideas, ideasStatus, loadIdeas } = usePlan();
  const { go } = useNav();
  return (
    <Panel title="Ideas for you" icon={Lightbulb} tone="ai" actions={<AiBadge />}>
      {ideasStatus === "unavailable" ? (
        <p className="text-sm text-muted-foreground">Ideas need the AI, which isn't set up here. Everything else works without it.</p>
      ) : ideasStatus === "loading" && !ideas ? (
        <p className="text-sm text-ai" aria-live="polite">Finding ideas for you… usually under 10 seconds.</p>
      ) : ideas ? (
        <div className="space-y-3">
          <IdeasStatusLine />
          <ul className="space-y-2">
            {[ideas.themes[0], ideas.decor[0], ideas.food[0]].filter(Boolean).map((idea) => (
              <li key={idea.title} className="rounded-lg bg-surface p-4 shadow-card">
                <p className="font-display text-base">{idea.title}</p>
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{idea.detail}</p>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <AiNote />
            <Button size="sm" variant="link" className="no-print px-0 text-ai" onClick={() => go("ideas")}>All ideas <ArrowRight aria-hidden="true" /></Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <IdeasStatusLine />
          <Button variant="ai" onClick={loadIdeas}><Sparkles aria-hidden="true" /> Get ideas</Button>
        </div>
      )}
    </Panel>
  );
}

/** Not on the Overview since the band-and-card redesign; kept for reuse. */
export function VitalSigns() {
  const { plan, inputs } = usePlan();
  const contingency = plan.budget_lines.find((l) => l.key === "contingency");
  const ok = plan.budget_status === "ok";
  return (
    <section aria-labelledby="vitals-title">
      <h2 id="vitals-title" className="mb-4 text-xl">At a glance</h2>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Total budget" value={inr(inputs.budget_inr)} tone={ok ? undefined : "danger"}
          badge={<StatusBadge tone={ok ? "success" : "danger"}>{ok ? "Looks fine" : "Tight"}</StatusBadge>}
          hint={`${LEVEL_LABELS[plan.budget_level]} for ${plural(inputs.guests, "guest")}${plan.per_flat_inr ? ` · ${inr(plan.per_flat_inr)} per flat` : ""}`} />
        <Stat label="Per guest" value={inr(plan.per_guest_inr)} unit="per guest" tone={plan.per_guest_inr < plan.floor_per_guest_inr ? "danger" : undefined}
          hint={`A realistic minimum here is about ${inr(plan.floor_per_guest_inr)}`} />
        <Stat label="Days to go" value={plan.days_remaining} unit="days" highlight hint={`${weekday(plan.event_date)}, ${formatDate(plan.event_date)}`} />
        {contingency && (
          <Stat label="Buffer for surprises" value={inr(contingency.amount_inr)} tone={contingency.change_inr > 0 ? "success" : undefined}
            hint={contingency.change_inr ? `${signedInr(contingency.change_inr)} from accepted quotes and money moves` : "Kept aside for the unexpected"} />
        )}
      </div>
    </section>
  );
}

export function OverviewSection() {
  const { lead, attention } = useNextStep();
  return (
    <div>
      <OverviewBand />
      <OverviewCard next={<NextStepPanel lead={lead} attention={attention} />} nextBadge={<NextStepBadge attention={attention} />} footer={<BudgetBlock />} />
    </div>
  );
}
