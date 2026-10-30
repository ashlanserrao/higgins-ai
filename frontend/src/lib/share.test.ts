import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildShareUrl, emptyProgress, readSharedIdeas, readSharedInputs } from "./share";
import type { EventIdeas, PlanRequest } from "./types";

const inputs: PlanRequest = {
  event_type: "community", event_date: "2026-11-08", guests: 300, budget_inr: 150000, city: "Mysuru",
  city_tier: null, venue_type: "outdoor", venue_includes_catering: false, priorities: ["food", "decor"],
  households: 120, preferences: "", must_haves: "", progress: emptyProgress(),
};

const ideas: EventIdeas = {
  themes: [{ title: "Diya walk", detail: "Line the society path with clay lamps." }],
  decor: [{ title: "Rangoli contest", detail: "One square per wing, judged at 7 pm." }],
  food: [{ title: "Chaat counter", detail: "Pani puri and bhel, served by a local vendor." }],
  entertainment: [{ title: "Dandiya", detail: "An hour after dinner, with a hired dhol." }],
  triage_advice: "",
};

beforeEach(() => vi.stubGlobal("location", { origin: "https://plan.example", pathname: "/" }));
afterEach(() => vi.unstubAllGlobals());

describe("share links", () => {
  it("bring the plan inputs back from the link", async () => {
    const url = new URL(await buildShareUrl(inputs, "2026-10-21", null));
    expect(readSharedInputs(url.search)).toEqual({ inputs, plannedOn: "2026-10-21" });
  });

  it("never carry preferences, must-haves or progress", async () => {
    const own: PlanRequest = {
      ...inputs,
      preferences: "Grandma's 80th, keep it secret",
      must_haves: "Jain food",
      progress: { tasks: { venue: { state: "booked", on: "2026-10-01" } }, quotes: [], moves: [{ from_key: "decor", to_key: "food", amount_inr: 5000 }] },
    };
    const link = await buildShareUrl(own, "2026-10-21", null);
    for (const text of ["secret", "Jain", "booked", "from_key", "preferences", "must_haves", "progress"]) {
      expect(decodeURIComponent(link)).not.toContain(text);
    }
    expect(readSharedInputs(new URL(link).search)?.inputs).toMatchObject({ preferences: "", must_haves: "", progress: emptyProgress() });
  });

  it("carry ideas compressed in the #fragment", async () => {
    const url = new URL(await buildShareUrl(inputs, "2026-10-21", ideas));
    expect(url.hash.startsWith("#z")).toBe(true);
    expect(url.search).not.toContain("Diya");
    expect(await readSharedIdeas(url.hash)).toEqual(ideas);
  });

  it("drop ideas that are tampered with or too long", async () => {
    const tooLong = { ...ideas, themes: [{ title: "x".repeat(81), detail: "Long" }] };
    const url = new URL(await buildShareUrl(inputs, "2026-10-21", tooLong));
    expect(await readSharedIdeas(url.hash)).toBeNull();
    expect(await readSharedIdeas("#zNotDeflate")).toBeNull();
    expect(await readSharedIdeas(`#q${"a".repeat(20)}`)).toBeNull();
  });

  it("are only links that name an event type", () => {
    expect(readSharedInputs("?guests=10")).toBeNull();
  });
});
