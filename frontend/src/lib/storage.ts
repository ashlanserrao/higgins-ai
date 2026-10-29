// Everything the organiser does lives in this browser only, under their account. Storage can
// be blocked (private mode, disabled site data), so every read and write is allowed to fail.

import { emptyProgress } from "./share";
import type { EventIdeas, Guest, Plan, PlanRequest } from "./types";

const KEY = "eventPlanner:v4"; // before accounts; each account now has its own copy
const ownKey = (owner: string) => `${KEY}:${owner.toLowerCase()}`;
const V3_KEY = "eventPlanner:v3";
const V2_KEY = "eventPlanner:v2";

/** One event's plan and everything done for it. */
export interface Saved {
  inputs: PlanRequest;
  plan: Plan | null;
  aiAvailable: boolean;
  ideas: EventIdeas | null;
  ideasFor: string | null; // the inputs the ideas were made for
  plannedOn: string;
  guests: Guest[];
}

export interface SavedEvent extends Saved {
  id: string;
  name: string; // "" = named after its type and city
  savedOn: string; // the day `plan` was worked out, so a stale one can be refreshed
}

/** v4: several events. v3 was one event in the same shape as `Saved`. */
export interface SavedEvents {
  activeEventId: string | null;
  events: SavedEvent[];
}

interface SavedV2 {
  inputs: Omit<PlanRequest, "must_haves" | "progress">;
  plan: Plan | null;
  aiAvailable: boolean;
  ideas: EventIdeas | null;
  ideasFor: string | null;
  plannedOn: string;
  checked?: string[];
}

export const newEventId = () => crypto.randomUUID().slice(0, 8);

/** v2 kept ticked checklist items; v3 records them as bookings made on the planning day. */
function migrateV2(old: SavedV2): Saved {
  const on = old.plannedOn;
  const tasks = Object.fromEntries((old.checked || []).map((id) => [id, { state: "booked" as const, on }]));
  return {
    inputs: { ...old.inputs, must_haves: "", progress: { ...emptyProgress(), tasks } },
    plan: null, // recalculated on load, with the bookings
    aiAvailable: old.aiAvailable,
    ideas: old.ideas,
    ideasFor: null, // the inputs changed shape, so the ideas show as "made for an earlier version"
    plannedOn: old.plannedOn,
    guests: [],
  };
}

const read = (key: string) => {
  try {
    return JSON.parse(localStorage.getItem(key) || "null");
  } catch {
    return null;
  }
};

const EMPTY: SavedEvents = { activeEventId: null, events: [] };

/** Events saved in this browser before accounts (v4 without an owner, or older), if any. */
function unowned(): SavedEvents | null {
  const saved = read(KEY);
  if (Array.isArray(saved?.events)) return saved;
  const v3 = read(V3_KEY);
  const v2 = v3?.inputs ? null : read(V2_KEY);
  const single: Saved | null = v3?.inputs ? v3 : v2?.inputs ? migrateV2(v2) : null;
  if (!single) return null;
  const event = { ...single, id: newEventId(), name: "", savedOn: "" };
  return { activeEventId: event.id, events: [event] };
}

export const storage = {
  /** An account's events. The first account to load in a browser with no events of its own
   *  takes over whatever was saved before accounts, so nothing made earlier is lost. Signed
   *  out (no owner), there is nothing to load. */
  load(owner: string | null): SavedEvents {
    if (!owner) return EMPTY;
    const saved = read(ownKey(owner));
    if (Array.isArray(saved?.events)) return saved;
    const earlier = unowned();
    if (!earlier) return EMPTY;
    // The old copies go only once the new one is safely written.
    if (this.save(owner, earlier)) {
      try {
        for (const key of [KEY, V3_KEY, V2_KEY]) localStorage.removeItem(key);
      } catch {
        /* the old copy stays; this account never reads it again */
      }
    }
    return earlier;
  },

  save(owner: string | null, value: SavedEvents): boolean {
    if (!owner) return false;
    try {
      localStorage.setItem(ownKey(owner), JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },
};
