// Everything the organiser does lives in this browser only. Storage can be blocked
// (private mode, disabled site data), so every read and write is allowed to fail.

import { emptyProgress } from "./share";
import type { EventIdeas, Guest, Plan, PlanRequest } from "./types";

const KEY = "eventPlanner:v4";
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

export const storage = {
  load(): SavedEvents {
    const saved = read(KEY);
    if (Array.isArray(saved?.events)) return saved;
    const v3 = read(V3_KEY);
    const v2 = v3?.inputs ? null : read(V2_KEY);
    const single: Saved | null = v3?.inputs ? v3 : v2?.inputs ? migrateV2(v2) : null;
    if (!single) return { activeEventId: null, events: [] };
    const event = { ...single, id: newEventId(), name: "", savedOn: "" };
    const migrated = { activeEventId: event.id, events: [event] };
    // The old copy goes only once the new one is safely written.
    if (this.save(migrated)) {
      try {
        localStorage.removeItem(V3_KEY);
        localStorage.removeItem(V2_KEY);
      } catch {
        /* the old copy stays; it is never read again once v4 exists */
      }
    }
    return migrated;
  },

  save(value: SavedEvents): boolean {
    try {
      localStorage.setItem(KEY, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },
};
