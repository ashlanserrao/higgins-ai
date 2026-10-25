// Everything the organiser does lives in this browser only. Storage can be blocked
// (private mode, disabled site data), so every read and write is allowed to fail.

import { emptyProgress } from "./share";
import type { EventIdeas, Guest, Plan, PlanRequest } from "./types";

const KEY = "eventPlanner:v3";
const V2_KEY = "eventPlanner:v2";

export interface Saved {
  inputs: PlanRequest;
  plan: Plan | null;
  aiAvailable: boolean;
  ideas: EventIdeas | null;
  ideasFor: string | null; // the inputs the ideas were made for
  plannedOn: string;
  guests: Guest[];
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
  load(): Saved | null {
    const saved = read(KEY);
    if (saved?.inputs) return saved;
    const old = read(V2_KEY);
    if (!old?.inputs) return null;
    const migrated = migrateV2(old);
    this.save(migrated);
    try {
      localStorage.removeItem(V2_KEY);
    } catch {
      /* the old copy stays; it is never read again once v3 exists */
    }
    return migrated;
  },

  save(value: Saved) {
    try {
      localStorage.setItem(KEY, JSON.stringify(value));
    } catch {
      /* not persisted */
    }
  },

  clear() {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* nothing to clear */
    }
  },
};
