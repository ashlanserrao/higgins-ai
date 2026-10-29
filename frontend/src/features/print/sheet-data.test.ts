import { describe, expect, it } from "vitest";
import type { ChecklistItem, Plan, TimelineEntry } from "@/lib/types";
import { sheetBookings, sheetDates } from "./sheet-data";

const TODAY = "2026-10-29";

const item = (id: string, changes: Partial<ChecklistItem> = {}): ChecklistItem => ({
  id, label: `Book the ${id}`, lead_days: 30, book_by: "2026-12-01", status: "on_track", essential: true, done: false,
  booked_on: null, expected_on: null, delayed_by: null, waiting_on: [], at_risk: false, ...changes,
});

const entry = (date: string, kind: TimelineEntry["kind"]): TimelineEntry => ({ date, label: `${kind} ${date}`, kind, status: "on_track" });

const plan = (checklist: ChecklistItem[], timeline: TimelineEntry[] = []): Plan => ({
  event_type: "wedding", event_date: "2027-02-14", today: TODAY, days_remaining: 108, city_tier: 1,
  per_guest_inr: 6000, floor_per_guest_inr: 1500, budget_status: "ok", budget_level: "comfortable",
  budget_lines: [], warnings: [], cost_saving_swaps: [], timeline, checklist,
  triage: { active: false, book_today: [], cut_suggestions: [] },
  per_flat_inr: null, ignored_progress: [], quote_comparisons: {}, ignored_quotes: [], ignored_moves: [], rebalance: null,
});

describe("sheetBookings", () => {
  it("lists overdue first as due now, a delay at its new date, and booked ones by short name", () => {
    const { open, booked } = sheetBookings(plan([
      item("decor", { book_by: "2026-11-20" }),
      item("venue", { book_by: "2026-03-01", status: "book_today" }),
      item("caterer", { delayed_by: "caterer", expected_on: "2026-11-05", book_by: "2026-10-01" }),
      item("photographer", { done: true }),
    ]));
    expect(open.map((b) => [b.id, b.due])).toEqual([["venue", null], ["caterer", "2026-11-05"], ["decor", "2026-11-20"]]);
    expect(booked).toEqual(["photographer"]);
  });

  it("stops at ten open bookings and counts the rest", () => {
    const { open, more } = sheetBookings(plan(Array.from({ length: 13 }, (_, i) => item(`task${i}`))));
    expect([open.length, more]).toEqual([10, 3]);
  });
});

it("sheetDates keeps the day itself when milestones are trimmed", () => {
  const dates = sheetDates(plan([], [
    ...["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07"].map((d) => entry(d, "milestone")),
    entry("2026-11-10", "booking"),
    entry("2027-02-14", "event"),
  ]));
  expect(dates.map((d) => d.kind)).toEqual(["milestone", "milestone", "milestone", "milestone", "milestone", "event"]);
});
