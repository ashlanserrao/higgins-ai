// Words for the Ask Higgins dock: example commands worked out from the open event, and the
// review card's headline and before → after rows, built from what /api/ask returns.

import { CalendarDays, MessageSquareText, Users, Wallet, type LucideIcon } from "lucide-react";
import { addDays, formatShortDate, inr, plural, titleCase } from "@/lib/format";
import { LEVEL_LABELS, TIER_LABELS, VENUE_LABELS } from "@/lib/labels";
import { canMessage, DIFF_TASK_LABELS } from "@/lib/tasks";
import type { AskResponse, FieldChange, Plan, PlanDiff, PlanRequest } from "@/lib/api/types";

// The API's limits (app/models.py), so an example never asks for something it would refuse.
const MAX_GUESTS = 5000;
const MAX_BUDGET = 100_000_000;

/** A step a budget rounds up to, so a suggested figure reads like one a person would say. */
const roundUp = (amount: number) => {
  const step = amount < 1_00_000 ? 1000 : amount < 10_00_000 ? 10_000 : 1_00_000;
  return Math.ceil(amount / step) * step;
};

/** Up to four commands that would each change something: none of them is already true. The
 *  last asks for a vendor message, which only the agent can do. */
export function suggestions(inputs: PlanRequest, plan: Plan): { icon: LucideIcon; text: string }[] {
  const overBudget = plan.rebalance?.over_budget_inr ?? 0;
  const budget = roundUp(overBudget > 0 ? inputs.budget_inr + overBudget : inputs.budget_inr * 1.1);
  const vendor = plan.checklist.find((item) => !item.done && canMessage(item.id));
  return [
    { icon: CalendarDays, text: `Move the date to ${formatShortDate(addDays(inputs.event_date, 7))}` },
    { icon: Users, text: inputs.guests + 10 <= MAX_GUESTS ? "Add 10 guests" : "Cut 10 guests" },
    ...(budget > inputs.budget_inr && budget <= MAX_BUDGET ? [{ icon: Wallet, text: `Raise the budget to ${inr(budget)}` }] : []),
    // "Book the caterer" → "Write to the caterer".
    ...(vendor ? [{ icon: MessageSquareText, text: vendor.label.replace(/^Book /, "Write to ") }] : []),
  ];
}

/** A form value as the organiser would write it. */
function shown(field: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "not set";
  if (Array.isArray(value)) return value.join(", ") || "none";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  switch (field) {
    case "event_date": return formatShortDate(String(value));
    case "budget_inr": return inr(Number(value));
    case "venue_type": return VENUE_LABELS[value as keyof typeof VENUE_LABELS] ?? String(value);
    case "city_tier": return TIER_LABELS[value as keyof typeof TIER_LABELS] ?? String(value);
    case "city": return titleCase(String(value));
    default: return String(value);
  }
}

const OCCASION = { wedding: "wedding", birthday: "party", community: "event" } as const;
const WHERE = { venue: "at a hall or venue", home: "at home", outdoor: "outdoors" } as const;

function phrase({ field, label, before, after }: FieldChange, inputs: PlanRequest): string {
  const was = Number(before), now = Number(after);
  switch (field) {
    case "event_date": return `Move the ${OCCASION[inputs.event_type]} to ${shown(field, after)}`;
    case "guests": return before == null ? `Plan for ${plural(now, "guest")}` : `${now > was ? "Add" : "Cut"} ${plural(Math.abs(now - was), "guest")}`;
    case "budget_inr": return `${now > was ? "Raise" : "Lower"} the budget to ${inr(now)}`;
    case "venue_type": return `Hold it ${WHERE[after as keyof typeof WHERE] ?? shown(field, after)}`;
    case "city": return `Move it to ${shown(field, after)}`;
    default: return `Change ${label.toLowerCase()} to ${shown(field, after)}`;
  }
}

/** "A, b and c", each part after the first starting lower case. */
function joined(parts: string[]): string {
  const words = parts.map((part, i) => (i ? part[0].toLowerCase() + part.slice(1) : part));
  return words.length > 1 ? `${words.slice(0, -1).join(", ")} and ${words.at(-1)}` : words[0] ?? "";
}

const KIND_WORDS = { enquiry: "an enquiry", follow_up: "a follow-up", confirmation: "a confirmation" } as const;

/** What the agent proposes, in our words, built from what changes rather than from the model's
 *  reply: "Move ₹2,000 from Decor to Food and draft an enquiry to the caterer". */
export function askHeadline(response: AskResponse, inputs: PlanRequest): string {
  const lineLabel = (key: string) => response.plan?.budget_lines.find((line) => line.key === key)?.label ?? key;
  const moves = (response.inputs?.progress.moves ?? []).slice(inputs.progress.moves.length);
  return joined([
    ...response.fields.map((f) => phrase(f, inputs)),
    ...moves.map((m) => `Move ${inr(m.amount_inr)} from ${lineLabel(m.from_key)} to ${lineLabel(m.to_key)}`),
    ...response.messages.map((m) => `Draft ${KIND_WORDS[m.kind]} to the ${m.label}`),
  ]);
}

export interface Row { key: string; label: string; before: string; after: string }

/** Exactly what changes: the fields first, then what the engine works out from them. */
export function reviewRows({ fields, changes }: { fields: FieldChange[]; changes: PlanDiff | null | undefined }): Row[] {
  const rows: Row[] = fields.map((f) => ({
    key: f.field, label: f.label[0].toUpperCase() + f.label.slice(1), before: shown(f.field, f.before), after: shown(f.field, f.after),
  }));
  if (!changes) return rows;
  const pair = (key: string, label: string, { before, after }: { before: unknown; after: unknown }, show: (v: never) => string) =>
    before !== after && rows.push({ key, label, before: show(before as never), after: show(after as never) });
  pair("per-guest", "Per guest", changes.per_guest_inr, inr);
  pair("days", "Days to go", changes.days_remaining, String);
  pair("status", "Budget", changes.budget_status, (v: string) => (v === "ok" ? "OK" : "Tight"));
  pair("over", "Over budget", changes.over_budget_inr, (v: number) => (v ? inr(v) : "No"));
  pair("level", "Budget level", changes.budget_level, (v: keyof typeof LEVEL_LABELS) => LEVEL_LABELS[v]);
  pair("triage", "Book-today list", changes.triage_active, (v: boolean) => (v ? "Yes" : "No"));
  for (const task of changes.tasks) {
    rows.push({
      key: `task-${task.id}`, label: task.label,
      before: task.before ? DIFF_TASK_LABELS[task.before] : "Not in plan", after: task.after ? DIFF_TASK_LABELS[task.after] : "Removed",
    });
  }
  for (const line of changes.lines) {
    rows.push({
      key: `line-${line.key}`, label: line.label,
      before: line.before_inr === null ? "Not in plan" : inr(line.before_inr), after: line.after_inr === null ? "Removed" : inr(line.after_inr),
    });
  }
  return rows;
}
