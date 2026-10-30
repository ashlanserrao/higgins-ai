// What the Next step panel leads with, and everything else that needs the organiser. Ranked by
// how soon it hurts: short on time first, then the soonest consequence (a booking past its usual
// date or due within 48 hours, or a vendor slip that moves a date within a week), then the next booking,
// then all clear. Money is separate: the panel's other column always shows the budget.

import { daysBetween, formatShortDate, inr } from "@/lib/format";
import { taskShortName } from "@/lib/tasks";
import type { ChecklistItem, Plan } from "@/lib/types";

export type Lead =
  | { kind: "triage"; today: ChecklistItem[]; canWait: ChecklistItem[]; cuts: string[] }
  | { kind: "slip"; item: ChecklistItem; moves: ChecklistItem[] }
  | { kind: "due"; item: ChecklistItem; days: number }
  | { kind: "next"; item: ChecklistItem; days: number }
  | { kind: "clear" };

/** One thing that needs the organiser, for the tab's count and the notes drawer. */
export interface Attention {
  id: string;
  label: string;
  detail: string;
}

const SOON_DAYS = 2; // "due within 48 hours"
const SLIP_WINDOW_DAYS = 7; // a slip leads when it moves a date within a week
const HEADS_UP_DAYS = 3; // the tab flags anything due within three days

const open = (item: ChecklistItem) => !item.done;
// Bookable now: not waiting on a prerequisite or on a delay (the engine's is_actionable).
const readyOn = (today: string) => (item: ChecklistItem) =>
  open(item) && !item.waiting_on.length && (!item.expected_on || item.expected_on <= today);
const byDate = (a: ChecklistItem, b: ChecklistItem) => a.book_by.localeCompare(b.book_by);

/** A booking that slipped (its own delay, not a knock-on), and what else it moves. */
export const slipMoves = (plan: Plan, item: ChecklistItem) =>
  plan.checklist.filter((other) => other.delayed_by === item.id && other.id !== item.id && open(other));

/** "Due in 2 days", "Due today". Past its usual book-by date the engine still calls a booking
 *  doable (it moves to today on the timeline), so it says when to book, not "overdue". */
export function dueLabel(item: ChecklistItem, days: number) {
  if (days < 0) return item.status === "book_today" ? "Book today" : "Book this week";
  if (days === 0) return "Due today";
  return `Due in ${days} ${days === 1 ? "day" : "days"}`;
}

export function leadFor(plan: Plan): Lead {
  const ready = readyOn(plan.today);
  if (plan.triage.active) {
    const today = plan.triage.book_today.map((id) => plan.checklist.find((item) => item.id === id)).filter((item): item is ChecklistItem => Boolean(item && open(item)));
    if (today.length)
      return {
        kind: "triage",
        today: today.slice(0, 3),
        canWait: plan.checklist.filter((item) => ready(item) && item.status === "on_track"),
        cuts: plan.triage.cut_suggestions,
      };
  }

  // The soonest consequence: an overdue or nearly due booking, or a slip landing this week.
  const candidates: { lead: Lead; date: string }[] = [];
  for (const item of plan.checklist.filter(ready)) {
    const days = daysBetween(plan.today, item.book_by);
    if (days <= SOON_DAYS) candidates.push({ lead: { kind: "due", item, days }, date: item.book_by });
  }
  for (const item of plan.checklist.filter((i) => open(i) && i.delayed_by === i.id && i.expected_on)) {
    const moves = slipMoves(plan, item);
    const dates = [item.expected_on!, ...moves.map((m) => m.expected_on).filter((d): d is string => Boolean(d))].sort();
    if (daysBetween(plan.today, dates[0]) <= SLIP_WINDOW_DAYS) candidates.push({ lead: { kind: "slip", item, moves }, date: dates[0] });
  }
  if (candidates.length) return candidates.sort((a, b) => a.date.localeCompare(b.date))[0].lead;

  const next = plan.checklist.filter(ready).sort(byDate)[0] ?? plan.checklist.filter(open).sort(byDate)[0];
  return next ? { kind: "next", item: next, days: daysBetween(plan.today, next.book_by) } : { kind: "clear" };
}

/** Everything that needs the organiser now, most pressing kinds first, each listed once. */
export function attentionFor(plan: Plan): Attention[] {
  const ready = readyOn(plan.today);
  const list: Attention[] = [];
  const add = (entry: Attention) => {
    if (!list.some((e) => e.id === entry.id)) list.push(entry);
  };
  const over = plan.rebalance?.over_budget_inr ?? 0;
  if (over > 0) add({ id: "over-budget", label: `Over budget by ${inr(over)}`, detail: "Confirmed costs are more than the budget." });
  for (const id of plan.triage.active ? plan.triage.book_today : []) {
    const item = plan.checklist.find((i) => i.id === id);
    if (item && open(item)) add({ id: item.id, label: item.label, detail: "Book today: less than half the usual lead time is left." });
  }
  for (const item of plan.checklist.filter((i) => open(i) && i.delayed_by === i.id && i.expected_on))
    add({ id: item.id, label: `The ${taskShortName(item.label)} slipped`, detail: `It can confirm from ${formatShortDate(item.expected_on!)}.` });
  for (const item of plan.checklist.filter(ready)) {
    const days = daysBetween(plan.today, item.book_by);
    if (days <= HEADS_UP_DAYS) add({ id: item.id, label: item.label, detail: dueLabel(item, days) });
  }
  return list;
}

/** The ids the lead already shows, so "+N more" counts only the rest. */
export function shownBy(lead: Lead): string[] {
  if (lead.kind === "triage") return lead.today.map((item) => item.id);
  if (lead.kind === "clear") return [];
  return [lead.item.id];
}
