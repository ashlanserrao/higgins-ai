// How a checklist item is presented. The engine decides the facts (done, delayed, at risk);
// this only picks which one to show first.

import type { ChecklistItem, EventType, MessageKind, Plan, TimelineEntry } from "./types";

export type TaskTone = "success" | "warning" | "danger" | "neutral";

export interface TaskBadge {
  label: string;
  tone: TaskTone;
}

/** One primary status per task, most important first. */
export function taskBadge(item: ChecklistItem): TaskBadge {
  if (item.done) return { label: "Booked", tone: "success" };
  if (item.delayed_by === item.id) return { label: "Delayed", tone: "danger" };
  if (item.at_risk) return { label: "At risk", tone: "danger" };
  if (item.waiting_on.length) return { label: "Waiting", tone: "neutral" };
  if (item.status === "book_today") return { label: "Book today", tone: "danger" };
  if (item.status === "tight") return { label: "Book this week", tone: "warning" };
  return { label: "On track", tone: "success" };
}

export const needsAction = (item: ChecklistItem) =>
  !item.done && (item.at_risk || item.status !== "on_track" || item.delayed_by === item.id);

/** What the event switcher counts as "to do" today. */
export const dueToday = (item: ChecklistItem) => !item.done && item.status === "book_today";

export const TIMELINE_STATUS: Record<TimelineEntry["status"], TaskBadge> = {
  done: { label: "Done", tone: "success" },
  on_track: { label: "On track", tone: "success" },
  tight: { label: "Tight", tone: "warning" },
  overdue: { label: "Overdue", tone: "danger" },
  at_risk: { label: "At risk", tone: "danger" },
};

/** Labels for the task states the before/after diff uses. */
export const DIFF_TASK_LABELS: Record<string, string> = {
  done: "Booked",
  at_risk: "At risk",
  book_today: "Book today",
  tight: "Book this week",
  on_track: "On track",
};

// Mirrors rules.LINE_TASKS / EXTRA_LINE_TASKS: accepting a quote for a line books this task.
const LINE_TASKS: Record<EventType, Record<string, string>> = {
  wedding: {
    venue: "venue", food: "caterer", decor: "decor", photography: "photographer",
    attire: "attire", entertainment: "music", invitations: "invitations",
  },
  birthday: { venue: "venue", decor: "decor", entertainment: "entertainer", return_gifts: "return_gifts" },
  community: { venue: "venue", food: "caterer", sound: "sound", performers: "performers", safety: "security" },
};
const EXTRA_LINE_TASKS: Record<string, string> = { venue_food: "venue", tent: "tent" };

export const lineTask = (eventType: EventType, lineKey: string): string | undefined =>
  LINE_TASKS[eventType][lineKey] ?? EXTRA_LINE_TASKS[lineKey];

export const taskLine = (eventType: EventType, taskId: string): string | undefined => {
  const lines = { ...LINE_TASKS[eventType], ...EXTRA_LINE_TASKS };
  return Object.keys(lines).find((key) => lines[key] === taskId);
};

// Mirrors rules.VENDOR_ASK: these bookings have no vendor to message.
const NO_VENDOR = new Set(["permissions", "weather_backup"]);
export const canMessage = (taskId: string) => !NO_VENDOR.has(taskId);

export function defaultMessageKind(item: ChecklistItem): MessageKind {
  if (item.done) return "confirmation";
  if (item.delayed_by || item.at_risk || item.status !== "on_track") return "follow_up";
  return "enquiry";
}

export const MESSAGE_KINDS: { value: MessageKind; label: string; hint: string }[] = [
  { value: "enquiry", label: "Enquiry", hint: "Ask for a quote, with the questions that make replies comparable." },
  { value: "follow_up", label: "Follow-up", hint: "Chase a reply before the book-by date." },
  { value: "confirmation", label: "Confirmation", hint: "Confirm headcount, timings and payment terms." },
];

export const taskLabel = (plan: Plan, id: string) =>
  plan.checklist.find((item) => item.id === id)?.label ?? id;

/** Short vendor names for prose: "Book the venue" → "venue". */
export const taskShortName = (label: string) =>
  label.replace(/^(Book|Order or send|Order|Buy|Arrange|Get|Plan) (the |a )?/i, "").replace(/ \(.*\)$/, "");
