import { describe, expect, it } from "vitest";
import type { ChecklistItem, Plan } from "@/lib/types";
import { dueLabel, leadFor } from "./next-step";

const TODAY = "2026-10-21";

const item = (id: string, changes: Partial<ChecklistItem> = {}): ChecklistItem => ({
  id, label: id, lead_days: 30, book_by: "2026-12-01", status: "on_track", essential: true, done: false,
  booked_on: null, expected_on: null, delayed_by: null, waiting_on: [], at_risk: false, ...changes,
});

const plan = (checklist: ChecklistItem[], triage: Partial<Plan["triage"]> = {}): Plan => ({
  event_type: "wedding", event_date: "2027-02-14", today: TODAY, days_remaining: 116, city_tier: 1,
  per_guest_inr: 6000, floor_per_guest_inr: 1500, budget_status: "ok", budget_level: "comfortable",
  budget_lines: [], warnings: [], cost_saving_swaps: [], timeline: [], checklist,
  triage: { active: false, book_today: [], cut_suggestions: [], ...triage },
  per_flat_inr: null, ignored_progress: [], quote_comparisons: {}, ignored_quotes: [], ignored_moves: [], rebalance: null,
});

// A vendor that can only confirm later than planned: its own delay, not a knock-on.
const slipped = (id: string, expected_on: string) => item(id, { delayed_by: id, expected_on, status: "tight" });

describe("leadFor ranks by how soon it hurts", () => {
  it("leads with triage over a slip and a booking due tomorrow", () => {
    const lead = leadFor(plan(
      [item("venue", { status: "book_today", book_by: "2026-10-01" }), slipped("photo", "2026-10-22"), item("decor", { book_by: "2026-10-22" })],
      { active: true, book_today: ["venue"], cut_suggestions: ["Trim the guest list"] },
    ));
    expect(lead.kind).toBe("triage");
    if (lead.kind !== "triage") return;
    expect(lead.today.map((i) => i.id)).toEqual(["venue"]);
    expect(lead.cuts).toEqual(["Trim the guest list"]);
  });

  it("drops triage once every book-today item is booked", () => {
    const lead = leadFor(plan(
      [item("venue", { status: "book_today", done: true }), item("decor", { book_by: "2026-10-22" })],
      { active: true, book_today: ["venue"] },
    ));
    expect(lead).toMatchObject({ kind: "due", item: { id: "decor" }, days: 1 });
  });

  it("puts a slip landing tomorrow ahead of a booking due in two days, with what it moves", () => {
    const knockOn = item("decor", { delayed_by: "venue", expected_on: "2026-10-25" });
    const lead = leadFor(plan([item("cake", { book_by: "2026-10-23" }), slipped("venue", "2026-10-22"), knockOn]));
    expect(lead).toMatchObject({ kind: "slip", item: { id: "venue" }, moves: [{ id: "decor" }] });
  });

  it("puts an overdue booking ahead of a slip later in the week", () => {
    const lead = leadFor(plan([slipped("photo", "2026-10-26"), item("cake", { book_by: "2026-10-20" })]));
    expect(lead).toMatchObject({ kind: "due", item: { id: "cake" }, days: -1 });
  });

  it("leads with the next ready booking when nothing is urgent", () => {
    const lead = leadFor(plan([
      slipped("photo", "2026-11-05"), // more than a week out: not urgent
      item("decor", { book_by: "2026-10-30", waiting_on: ["venue"] }), // sooner, but waiting
      item("cake", { book_by: "2026-11-10" }),
    ]));
    expect(lead).toMatchObject({ kind: "next", item: { id: "cake" }, days: 20 });
  });

  it("doesn't lead with a booking a delay keeps waiting", () => {
    // Due tomorrow, but the vendor can only confirm in two weeks.
    const photo = item("photo", { delayed_by: "photo", expected_on: "2026-11-04", book_by: "2026-10-22", status: "tight" });
    const lead = leadFor(plan([photo, item("cake", { book_by: "2026-11-10" })]));
    expect(lead).toMatchObject({ kind: "next", item: { id: "cake" } });
  });

  it("is clear when everything is booked", () => {
    expect(leadFor(plan([item("venue", { done: true })]))).toEqual({ kind: "clear" });
  });
});

it("says when to book, not 'overdue', once a booking is past its usual date", () => {
  expect(dueLabel(item("venue", { status: "book_today" }), -3)).toBe("Book today");
  expect(dueLabel(item("venue", { status: "tight" }), -3)).toBe("Book this week");
  expect(dueLabel(item("venue"), 0)).toBe("Due today");
  expect(dueLabel(item("venue"), 1)).toBe("Due in 1 day");
});
