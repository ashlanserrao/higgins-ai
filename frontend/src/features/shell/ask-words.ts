// Words for the Ask Higgins dock: example commands worked out from the open event, and the
// review card's headline and before → after rows, built from what /api/understand returns.

import { CalendarDays, Users, Wallet, type LucideIcon } from "lucide-react";
import { addDays, formatShortDate, inr, LEVEL_LABELS, plural, TIER_LABELS, titleCase, VENUE_LABELS } from "@/lib/format";
import { DIFF_TASK_LABELS } from "@/lib/tasks";
import type { PlanRequest, UnderstandResponse } from "@/lib/types";

// The API's limits (app/models.py), so an example never asks for something it would refuse.
const MAX_GUESTS = 5000;
const MAX_BUDGET = 100_000_000;

/** A step a budget rounds up to, so a suggested figure reads like one a person would say. */
const roundUp = (amount: number) => {
  const step = amount < 1_00_000 ? 1000 : amount < 10_00_000 ? 10_000 : 1_00_000;
  return Math.ceil(amount / step) * step;
};

/** Up to three commands that would each change something: none of them is already true. */
export function suggestions(inputs: PlanRequest, overBudget: number): { icon: LucideIcon; text: string }[] {
  const budget = roundUp(overBudget > 0 ? inputs.budget_inr + overBudget : inputs.budget_inr * 1.1);
  return [
    { icon: CalendarDays, text: `Move the date to ${formatShortDate(addDays(inputs.event_date, 7))}` },
    { icon: Users, text: inputs.guests + 10 <= MAX_GUESTS ? "Add 10 guests" : "Cut 10 guests" },
    ...(budget > inputs.budget_inr && budget <= MAX_BUDGET ? [{ icon: Wallet, text: `Raise the budget to ${inr(budget)}` }] : []),
  ];
}

type FieldChange = UnderstandResponse["fields"][number];

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

/** The command restated in plain words: "Move the party to 15 Nov and add 10 guests". */
export function headline(fields: FieldChange[], inputs: PlanRequest): string {
  const parts = fields.map((f, i) => {
    const words = phrase(f, inputs);
    return i ? words[0].toLowerCase() + words.slice(1) : words;
  });
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts[0] ?? "";
}

export interface Row { key: string; label: string; before: string; after: string }

/** Exactly what changes: the fields first, then what the engine works out from them. */
export function reviewRows({ fields, changes }: UnderstandResponse): Row[] {
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
