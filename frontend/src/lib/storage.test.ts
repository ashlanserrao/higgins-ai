import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyProgress } from "./share";
import { storage, type SavedEvent } from "./storage";
import type { PlanRequest } from "./types";

/** A Map-backed localStorage; `blocked` makes every call throw, as private mode can. */
function fakeStorage(entries: Record<string, string> = {}, blocked = false) {
  const data = new Map(Object.entries(entries));
  const guard = () => {
    if (blocked) throw new DOMException("The operation is insecure.", "SecurityError");
  };
  const store = {
    getItem: (key: string) => (guard(), data.get(key) ?? null),
    setItem: (key: string, value: string) => (guard(), void data.set(key, value)),
    removeItem: (key: string) => (guard(), void data.delete(key)),
  };
  vi.stubGlobal("localStorage", store);
  return data;
}

afterEach(() => vi.unstubAllGlobals());

const inputs: PlanRequest = {
  event_type: "birthday", event_date: "2026-11-11", guests: 40, budget_inr: 12000, city: "Mysuru", city_tier: null,
  venue_type: "home", venue_includes_catering: false, priorities: [], households: null, preferences: "", must_haves: "",
  progress: emptyProgress(),
};
const event: SavedEvent = {
  id: "a1b2c3d4", name: "", savedOn: "2026-10-21", inputs, plan: null, aiAvailable: false, ideas: null, ideasFor: null,
  plannedOn: "2026-10-21", guests: [{ id: "g1", name: "Asha", group: "Family", party: 3, rsvp: "yes" }],
};

describe("storage", () => {
  it("loads what it saved", () => {
    fakeStorage();
    expect(storage.save({ activeEventId: event.id, events: [event] })).toBe(true);
    expect(storage.load()).toEqual({ activeEventId: event.id, events: [event] });
  });

  it("starts empty instead of crashing when storage is blocked", () => {
    fakeStorage({}, true);
    expect(storage.load()).toEqual({ activeEventId: null, events: [] });
    expect(storage.save({ activeEventId: null, events: [event] })).toBe(false);
  });

  it("starts empty when the saved copy is corrupt", () => {
    fakeStorage({ "eventPlanner:v4": "{not json" });
    expect(storage.load()).toEqual({ activeEventId: null, events: [] });
  });

  it("moves a v2 plan into v4, keeping ticked items as bookings, then removes the old copy", () => {
    const { must_haves: _m, progress: _p, ...oldInputs } = inputs;
    const v2 = { inputs: oldInputs, plan: null, aiAvailable: true, ideas: null, ideasFor: "x", plannedOn: "2026-09-01", checked: ["cake"] };
    const data = fakeStorage({ "eventPlanner:v2": JSON.stringify(v2) });
    const { activeEventId, events: [moved] } = storage.load();
    expect(activeEventId).toBe(moved.id);
    expect(moved.inputs.progress.tasks).toEqual({ cake: { state: "booked", on: "2026-09-01" } });
    expect(moved.ideasFor).toBeNull();
    expect([...data.keys()]).toEqual(["eventPlanner:v4"]);
  });
});
