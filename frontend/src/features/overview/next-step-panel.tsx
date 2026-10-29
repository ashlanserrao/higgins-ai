// The Next step tab: what to do now on the left (see next-step.ts for how it's chosen), the
// budget on the right, and a drawer with everything else. One filled button: the lead's.

import { useState, type ReactNode } from "react";
import { ArrowRight, CalendarClock, CheckCircle2, Clock, MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AiBadge, StatusBadge } from "@/components/badges";
import { MessageDialog } from "@/components/app/message-dialog";
import { useChangePreview } from "@/components/app/use-change-preview";
import { EVENT_LABELS, formatShortDate, inr, plural } from "@/lib/format";
import { canMessage, taskShortName } from "@/lib/tasks";
import type { ChecklistItem } from "@/lib/types";
import { useNav } from "@/state/nav";
import { usePlan } from "@/state/planner";
import { BookingDialog, type BookingTarget } from "@/components/app/booking-dialog";
import { attentionFor, dueLabel, leadFor, shownBy, type Attention, type Lead } from "./next-step";

/** Shared by the panel and the tab: the lead and what else needs the organiser. */
export function useNextStep() {
  const { plan } = usePlan();
  const lead = leadFor(plan);
  const attention = attentionFor(plan);
  return { lead, attention };
}

/** On the Next step tab: a count when several things need the organiser, a dot for one. */
export function NextStepBadge({ attention }: { attention: Attention[] }) {
  if (!attention.length) return null;
  if (attention.length === 1)
    return <><span className="size-2 rounded-full bg-warning" aria-hidden="true" /><span className="sr-only">, something needs you</span></>;
  return (
    <span className="num rounded-full bg-warning-soft px-1.5 text-xs font-semibold text-warning">
      {attention.length}<span className="sr-only"> things need you</span>
    </span>
  );
}

const PRIMARY = "rounded-full max-md:min-h-11 max-md:w-full";
/** Text links, 44px tall on phones and touch screens. */
const LINK = "h-auto px-0 max-md:min-h-11 pointer-coarse:min-h-11";

/** The lead's actions: the filled button, then a quieter link. */
function TaskActions({ item, primary, onBook, onMessage }: {
  item: ChecklistItem; primary: boolean; onBook: (id: string) => void; onMessage: (id: string) => void;
}) {
  if (!primary)
    return <Button size="sm" variant="link" className={LINK} onClick={() => onBook(item.id)}>Mark booked</Button>;
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
      {canMessage(item.id) ? (
        <>
          <Button className={PRIMARY} onClick={() => onMessage(item.id)}><MessageSquareText aria-hidden="true" /> Draft an enquiry (2 min)</Button>
          <Button variant="link" className={LINK} onClick={() => onBook(item.id)}>Mark booked</Button>
        </>
      ) : (
        <Button className={PRIMARY} onClick={() => onBook(item.id)}><CheckCircle2 aria-hidden="true" /> Mark booked</Button>
      )}
    </div>
  );
}

function Lead({ lead, onBook, onMessage }: { lead: Lead; onBook: (id: string) => void; onMessage: (id: string) => void }) {
  const { plan, inputs } = usePlan();
  const { go } = useNav();
  const event = EVENT_LABELS[inputs.event_type].toLowerCase();
  const away = `your ${event} is ${plural(plan.days_remaining, "day")} away`;
  const why = (item: ChecklistItem) =>
    item.waiting_on.length
      ? `It waits on the ${item.waiting_on.map((id) => taskShortName(plan.checklist.find((i) => i.id === id)?.label ?? id)).join(" and ")}, so it can't be booked yet.`
      : `This is usually booked about ${item.lead_days} days ahead, and ${away}.`;

  if (lead.kind === "triage")
    return (
      <div>
        <StatusBadge tone="danger" icon={Clock}>Short on time: do these today</StatusBadge>
        <ol className="mt-3 space-y-3">
          {lead.today.map((item, index) => (
            <li key={item.id}>
              {index === 0 ? <h3 className="text-[19px] leading-snug">{item.label}</h3> : <p className="text-sm font-medium">{item.label}</p>}
              <p className="text-[13px] text-muted-foreground">Usually booked about {item.lead_days} days ahead.</p>
              <TaskActions item={item} primary={index === 0} onBook={onBook} onMessage={onMessage} />
            </li>
          ))}
        </ol>
        {lead.canWait.length > 0 && (
          <details className="mt-4 text-sm">
            <summary className="cursor-pointer font-medium">Can wait ({lead.canWait.length})</summary>
            <ul className="mt-1.5 space-y-1 text-muted-foreground">
              {lead.canWait.map((item) => <li key={item.id}>{item.label}, by {formatShortDate(item.book_by)}</li>)}
            </ul>
          </details>
        )}
        {lead.cuts.length > 0 && (
          <details className="mt-2 text-sm">
            <summary className="cursor-pointer font-medium">Suggested cuts ({lead.cuts.length})</summary>
            <ul className="mt-1.5 list-disc space-y-1 pl-5 text-muted-foreground">{lead.cuts.map((cut) => <li key={cut}>{cut}</li>)}</ul>
          </details>
        )}
      </div>
    );

  if (lead.kind === "slip") {
    const { item, moves } = lead;
    return (
      <div>
        <StatusBadge tone="warning" icon={CalendarClock}>A booking slipped</StatusBadge>
        <h3 className="mt-3 text-[19px] leading-snug">Your {taskShortName(item.label)} can confirm from {formatShortDate(item.expected_on!)}</h3>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {moves.length
            ? <>That moves {moves.map((m, i) => <span key={m.id}>{i ? (i === moves.length - 1 ? " and " : ", ") : ""}the {taskShortName(m.label)}{m.expected_on ? ` (now ${formatShortDate(m.expected_on)})` : ""}</span>)}. A quick message might bring it forward.</>
            : "Nothing else waits on it, so the rest of your plan stays as it is."}
          {item.at_risk && <> It's after the usual book-by date of {formatShortDate(item.book_by)}.</>}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          {canMessage(item.id) && (
            <Button className={PRIMARY} onClick={() => onMessage(item.id)}><MessageSquareText aria-hidden="true" /> Message the vendor</Button>
          )}
          <Button variant={canMessage(item.id) ? "link" : "default"} className={canMessage(item.id) ? LINK : PRIMARY} onClick={() => go("tasks")}>
            See what changes <ArrowRight aria-hidden="true" />
          </Button>
        </div>
      </div>
    );
  }

  if (lead.kind === "clear")
    return (
      <div>
        <StatusBadge tone="success">All booked</StatusBadge>
        <h3 className="mt-3 text-[19px] leading-snug">You're all set</h3>
        <p className="mt-1 text-[13px] text-muted-foreground">Every booking is done. The timeline shows what's left on the day.</p>
        <div className="mt-4"><Button className={PRIMARY} onClick={() => go("tasks")}>See the timeline <ArrowRight aria-hidden="true" /></Button></div>
      </div>
    );

  const { item, days } = lead;
  const urgent = lead.kind === "due";
  return (
    <div>
      {urgent
        ? <StatusBadge tone="warning" icon={Clock}>{dueLabel(item, days)}</StatusBadge>
        : <StatusBadge tone="neutral" icon={Clock}>Coming up · by {formatShortDate(item.book_by)}</StatusBadge>}
      <h3 className="mt-3 text-[19px] leading-snug">{item.label}</h3>
      <p className="mt-1 text-[13px] text-muted-foreground">{why(item)}</p>
      {!item.waiting_on.length && <TaskActions item={item} primary onBook={onBook} onMessage={onMessage} />}
    </div>
  );
}

/** The budget, always: over budget, tight, or comfortable. Fixes are previewed, then undoable. */
function Money() {
  const { plan, inputs } = usePlan();
  const { go } = useNav();
  const { preview, dialog } = useChangePreview();
  const over = plan.rebalance?.over_budget_inr ?? 0;
  const floor = plan.floor_per_guest_inr;
  const buffer = plan.budget_lines.find((line) => line.key === "contingency")?.amount_inr ?? 0;
  const raiseTo = (budget: number) =>
    preview({ title: `Budget ${inr(budget)}`, label: `Budget raised to ${inr(budget)}`, changes: { budget_inr: budget } });
  const chip = "rounded-full max-md:min-h-11 pointer-coarse:min-h-11";

  let body: ReactNode;
  if (over > 0) {
    body = (
      <>
        <StatusBadge tone="danger">Over budget</StatusBadge>
        <h3 className="mt-3 text-[19px] leading-snug">Confirmed costs are {inr(over)} over budget</h3>
        <p className="mt-1 text-[13px] text-muted-foreground">The buffer is used up, and other lines are trimmed as far as they sensibly go.</p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" className={chip} onClick={() => raiseTo(inputs.budget_inr + over)}>Raise the budget to {inr(inputs.budget_inr + over)}</Button>
          <Button size="sm" variant="link" className={LINK} onClick={() => go("budget")}>Swap a quote <ArrowRight aria-hidden="true" /></Button>
        </div>
      </>
    );
  } else if (plan.per_guest_inr < floor) {
    const fits = Math.floor(inputs.budget_inr / floor);
    const short = floor * inputs.guests - inputs.budget_inr;
    body = (
      <>
        <StatusBadge tone="warning">Budget is tight</StatusBadge>
        <h3 className="mt-3 text-[19px] leading-snug">{inr(plan.per_guest_inr)} a guest won't stretch far</h3>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-soft" aria-hidden="true">
          <div className="h-full rounded-full bg-warning" style={{ width: `${Math.min(100, (plan.per_guest_inr / floor) * 100)}%` }} />
        </div>
        <p className="num mt-1.5 flex justify-between text-xs text-muted-foreground">
          <span>{inr(plan.per_guest_inr)} now</span><span>{inr(floor)} realistic</span>
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {fits >= 1 && fits < inputs.guests && (
            <Button size="sm" variant="outline" className={chip}
              onClick={() => preview({ title: `Plan for ${fits} guests`, label: `${fits} guests`, changes: { guests: fits } })}>
              Trim to {fits} guests
            </Button>
          )}
          {short > 0 && <Button size="sm" variant="outline" className={chip} onClick={() => raiseTo(inputs.budget_inr + short)}>Add {inr(short)}</Button>}
        </div>
      </>
    );
  } else {
    body = (
      <>
        <StatusBadge tone="success">Budget looks comfortable</StatusBadge>
        <p className="mt-3 text-[13px] text-muted-foreground">
          {inr(plan.per_guest_inr)} a guest is above the realistic {inr(floor)}, and {inr(buffer)} is kept aside for surprises.
        </p>
      </>
    );
  }
  return <div>{body}{dialog}</div>;
}

function NotesDrawer({ open, onOpenChange, attention }: { open: boolean; onOpenChange: (open: boolean) => void; attention: Attention[] }) {
  const { plan, ideas, ideasStatus, recent } = usePlan();
  const advice = plan.triage.active && ideasStatus === "ready" ? ideas?.triage_advice : "";
  const group = (title: string, children: ReactNode) => (
    <section className="space-y-2">
      <h3 className="text-base">{title}</h3>
      {children}
    </section>
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-0 right-0 left-auto h-dvh max-h-dvh max-w-md translate-x-0 translate-y-0 content-start overflow-y-auto rounded-none sm:max-w-md data-[state=open]:slide-in-from-right-8">
        <DialogHeader className="text-left">
          <DialogTitle>All notes</DialogTitle>
          <DialogDescription>Everything on your plan that needs a look, and what changed this visit.</DialogDescription>
        </DialogHeader>
        {attention.length > 0 && group("Needs you", (
          <ul className="space-y-2 text-sm">
            {attention.map((a) => <li key={a.id}><p className="font-medium">{a.label}</p><p className="text-muted-foreground">{a.detail}</p></li>)}
          </ul>
        ))}
        {plan.warnings.length > 0 && group("Notes on your plan", (
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">{plan.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        ))}
        {advice && group("A thought from AI", <div className="space-y-1.5 text-sm"><AiBadge /><p>{advice}</p></div>)}
        {group(`Recent changes (${recent.length})`, recent.length ? (
          <ul className="space-y-1.5 text-sm">
            {recent.map((change, i) => <li key={i}><span className="font-medium">{change.label}</span>{change.summary.length > 0 && <span className="text-muted-foreground"> · {change.summary.join(" ")}</span>}</li>)}
          </ul>
        ) : <p className="text-sm text-muted-foreground">Nothing changed yet this visit.</p>)}
      </DialogContent>
    </Dialog>
  );
}

export function NextStepPanel({ lead, attention }: { lead: Lead; attention: Attention[] }) {
  const { plan, ideas, ideasStatus, recent } = usePlan();
  const [booking, setBooking] = useState<BookingTarget | null>(null);
  const [messageFor, setMessageFor] = useState<string | null>(null);
  const [messageOpen, setMessageOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);

  const shown = new Set(shownBy(lead));
  const more = attention.filter((a) => !shown.has(a.id) && a.id !== "over-budget").length; // the budget column shows that one
  const advice = plan.triage.active && ideasStatus === "ready" && ideas?.triage_advice ? 1 : 0;
  const notes = attention.length + plan.warnings.length + advice + recent.length;

  return (
    <div className="@container">
      <div className="grid gap-5 @min-[640px]:grid-cols-2 @min-[640px]:gap-0">
        <div className="@min-[640px]:pr-6">
          <Lead lead={lead} onBook={(taskId) => setBooking({ taskId, state: "booked" })} onMessage={(id) => { setMessageFor(id); setMessageOpen(true); }} />
        </div>
        <div className="border-t pt-5 @min-[640px]:border-t-0 @min-[640px]:border-l @min-[640px]:pt-0 @min-[640px]:pl-6">
          <Money />
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 pt-4 text-xs">
        {more > 0
          ? <Button size="sm" variant="link" className={`${LINK} text-warning`} onClick={() => setNotesOpen(true)}>+{more} more need you</Button>
          : <span />}
        {notes > 0 && <Button size="sm" variant="link" className={LINK} onClick={() => setNotesOpen(true)}>All notes ({notes})</Button>}
      </div>
      <NotesDrawer open={notesOpen} onOpenChange={setNotesOpen} attention={attention} />
      <BookingDialog target={booking} onClose={() => setBooking(null)} />
      <MessageDialog taskId={messageFor} open={messageOpen} onOpenChange={setMessageOpen} />
    </div>
  );
}
