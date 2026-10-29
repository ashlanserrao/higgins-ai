// What the one-page print sheet shows, worked out from the plan: the lists are trimmed here so
// the page only lays them out, and a big event still fits one A4 sheet.

import { taskBadge, taskShortName, type TaskBadge } from "@/lib/tasks";
import type { EventIdeas, Guest, Plan, Rsvp } from "@/lib/types";

const MAX_BOOKINGS = 10;
const MAX_DATES = 6;
const MAX_GROUPS = 5;

export interface SheetBooking {
  id: string;
  label: string;
  due: string | null; // null: the book-by date has passed
  late: "Today" | "This week"; // said instead of a passed date, as the engine judges it
  badge: TaskBadge;
}

/** Open bookings, soonest first, and the short names of the ones already made. */
export function sheetBookings(plan: Plan) {
  // A delay moves the date to the day the vendor said they can confirm.
  const due = (item: Plan["checklist"][number]) =>
    item.delayed_by === item.id && item.expected_on ? item.expected_on : item.book_by > plan.today ? item.book_by : null;
  const open = plan.checklist
    .filter((item) => !item.done)
    .map((item): SheetBooking => ({
      id: item.id, label: item.label, due: due(item), late: item.status === "tight" ? "This week" : "Today", badge: taskBadge(item),
    }))
    .sort((a, b) => (a.due ?? "").localeCompare(b.due ?? ""));
  return {
    open: open.slice(0, MAX_BOOKINGS),
    more: Math.max(0, open.length - MAX_BOOKINGS),
    booked: plan.checklist.filter((item) => item.done).map((item) => taskShortName(item.label)),
  };
}

/** Milestones and the day itself; bookings have their own table. The day always makes the cut. */
export function sheetDates(plan: Plan) {
  const milestones = plan.timeline.filter((entry) => entry.kind === "milestone");
  const day = plan.timeline.filter((entry) => entry.kind === "event");
  return [...milestones.slice(0, MAX_DATES - day.length), ...day];
}

/** Each budget line with quotes: the accepted vendor, or how many quotes are in. */
export function sheetVendors(plan: Plan) {
  return plan.budget_lines.flatMap((line) => {
    const quotes = plan.quote_comparisons[line.key] ?? [];
    if (!quotes.length) return [];
    const accepted = quotes.find((quote) => quote.accepted) ?? null;
    return [{ key: line.key, label: line.label, accepted, quotes: quotes.length }];
  });
}

/** Heads per reply, and the biggest groups (heads invited, heads coming or maybe). */
export function sheetGuests(guests: Guest[]) {
  const heads = (rsvp: Rsvp) => guests.filter((g) => g.rsvp === rsvp).reduce((sum, g) => sum + g.party, 0);
  const groups = new Map<string, { invited: number; expected: number }>();
  for (const guest of guests) {
    const name = guest.group.trim() || "No group";
    const group = groups.get(name) ?? { invited: 0, expected: 0 };
    group.invited += guest.party;
    if (guest.rsvp === "yes" || guest.rsvp === "maybe") group.expected += guest.party;
    groups.set(name, group);
  }
  const sorted = [...groups].map(([name, counts]) => ({ name, ...counts })).sort((a, b) => b.invited - a.invited);
  return {
    yes: heads("yes"), maybe: heads("maybe"), invited: heads("invited"), no: heads("no"),
    groups: sorted.slice(0, MAX_GROUPS),
    moreGroups: Math.max(0, sorted.length - MAX_GROUPS),
  };
}

const IDEA_KINDS = [["themes", "Theme"], ["decor", "Décor"], ["food", "Food"], ["entertainment", "Entertainment"]] as const;

/** The first idea of each kind. */
export const sheetIdeas = (ideas: EventIdeas) =>
  IDEA_KINDS.flatMap(([key, label]) => (ideas[key][0] ? [{ label, idea: ideas[key][0] }] : []));
