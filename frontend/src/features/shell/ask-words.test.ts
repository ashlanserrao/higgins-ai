import { describe, expect, it } from "vitest";
import type { AskResponse, Plan, PlanRequest } from "@/lib/api/types";
import { inr } from "@/lib/format";
import { askHeadline, suggestions } from "./ask-words";

const earlierMove = { from_key: "sound", to_key: "food", amount_inr: 1000 };

const inputs = {
  event_type: "community", event_date: "2026-11-08", guests: 500, budget_inr: 150_000,
  progress: { tasks: {}, quotes: [], moves: [earlierMove] },
} as unknown as PlanRequest;

const plan = (checklist: { id: string; label: string; done: boolean }[]) => ({
  budget_lines: [{ key: "decor", label: "Decor" }, { key: "food", label: "Food" }],
  checklist, rebalance: null,
}) as unknown as Plan;

describe("askHeadline is built from what changes, not from the model's reply", () => {
  it("names field changes, new money moves and drafted messages", () => {
    const response = {
      reply: "Done! I added 40 guests and moved ₹9,99,999.", // the model's words: not used
      fields: [{ field: "guests", label: "number of guests", before: 500, after: 540 }],
      inputs: { ...inputs, progress: { ...inputs.progress, moves: [earlierMove, { from_key: "decor", to_key: "food", amount_inr: 2000 }] } },
      plan: plan([]),
      messages: [{ task_id: "caterer", label: "caterer", kind: "enquiry", text: "Hello," }],
    } as unknown as AskResponse;

    // The move already in the plan isn't repeated; only the new one is named.
    expect(askHeadline(response, inputs)).toBe(
      `Add 40 guests, move ${inr(2000)} from Decor to Food and draft an enquiry to the caterer`,
    );
  });
});

describe("suggestions", () => {
  it("offers a vendor message for the first open booking with a vendor", () => {
    const open = plan([
      { id: "permissions", label: "Get permissions", done: false }, // no vendor to message
      { id: "venue", label: "Book the venue", done: true },
      { id: "caterer", label: "Book the caterer", done: false },
    ]);
    expect(suggestions(inputs, open).at(-1)?.text).toBe("Write to the caterer");
    expect(suggestions(inputs, plan([])).map((s) => s.text)).not.toContain("Write to the caterer");
  });
});
