// The planner's state and the few primitives every action builds on: the latest-state ref,
// update/patch, request tickets and writes to a closed event's saved copy.

import { useCallback, useRef, useState } from "react";
import { todayInIndia } from "@/lib/format";
import type { SavedEvent } from "@/lib/storage";
import type { EventIdeas, Guest, Options, Plan, PlanRequest } from "@/lib/types";

/** The last change the organiser applied, so the dashboard can say what moved and undo it. */
export interface LastChange {
  label: string;
  summary: string[];
  previous: PlanRequest;
}

/** One line in "Recent changes": what the organiser changed during this visit. */
export interface RecentChange {
  label: string;
  summary: string[];
}

/** A deleted event, kept in memory so it can be undone. */
export interface DeletedEvent {
  event: SavedEvent;
  index: number;
  wasOpen: boolean;
}

export interface State {
  booting: boolean;
  bootError: string;
  options: Options | null;
  events: SavedEvent[];
  activeId: string | null; // null while planning a new event or viewing a shared link
  returnTo: string | null; // the event to go back to from either of those
  inputs: PlanRequest | null;
  plan: Plan | null;
  aiAvailable: boolean;
  ideas: EventIdeas | null;
  ideasFor: string | null;
  ideasLoadingFor: string | null; // whose ideas are on their way ("" = an event not saved yet)
  ideasFailed: boolean;
  plannedOn: string;
  guests: Guest[];
  shared: boolean; // viewing someone's link: saved only if the viewer keeps it
  lastChange: LastChange | null;
  recent: RecentChange[]; // newest first, this visit only: never saved
  lastDeleted: DeletedEvent | null;
  failure: { id: number; text: string } | null; // something the organiser asked for that didn't happen
}

const initialState: State = {
  booting: true, bootError: "", options: null, events: [], activeId: null, returnTo: null, inputs: null, plan: null,
  aiAvailable: false, ideas: null, ideasFor: null, ideasLoadingFor: null, ideasFailed: false, plannedOn: todayInIndia(),
  guests: [], shared: false, lastChange: null, recent: [], lastDeleted: null, failure: null,
};

/** The working copy for an event, or a blank one for planning a new event. */
export const opened = (event: SavedEvent | null): Partial<State> => ({
  activeId: event?.id ?? null,
  inputs: event?.inputs ?? null,
  plan: event?.plan ?? null,
  ideas: event?.ideas ?? null,
  ideasFor: event?.ideasFor ?? null,
  plannedOn: event?.plannedOn ?? todayInIndia(),
  guests: event?.guests ?? [],
  ideasFailed: false, shared: false, lastChange: null, recent: [], returnTo: null,
});

/** Every saved event, with the open one as it is now. */
export function allEvents(s: State): SavedEvent[] {
  if (!s.activeId || s.shared || !s.inputs || !s.plan) return s.events;
  const open: SavedEvent = {
    id: s.activeId, name: s.events.find((e) => e.id === s.activeId)?.name ?? "", savedOn: todayInIndia(),
    inputs: s.inputs, plan: s.plan, aiAvailable: s.aiAvailable, ideas: s.ideas, ideasFor: s.ideasFor,
    plannedOn: s.plannedOn, guests: s.guests,
  };
  return s.events.some((e) => e.id === open.id) ? s.events.map((e) => (e.id === open.id ? open : e)) : [...s.events, open];
}

export function useStore() {
  const [state, setState] = useState<State>(initialState);
  const [message, setMessage] = useState("");
  // Always the latest state, so actions taken before the next render build on it.
  const stateRef = useRef(state);
  // Each request gets a number per event, so a slow, outdated response never overwrites a newer one.
  const tickets = useRef<Record<string, number>>({});

  const announce = useCallback((text: string) => setMessage(text), []);
  /** A failure the organiser should see: a toast that stays until it's closed. */
  const fail = useCallback((text: string) => {
    stateRef.current = { ...stateRef.current, failure: { id: Date.now(), text } };
    setState(stateRef.current);
  }, []);
  const update = useCallback((change: (s: State) => Partial<State>) => {
    stateRef.current = { ...stateRef.current, ...change(stateRef.current) };
    setState(stateRef.current);
  }, []);
  const patch = useCallback((changes: Partial<State>) => update(() => changes), [update]);

  const takeTicket = useCallback((kind: "plan" | "ideas", owner: string | null) => {
    const key = `${kind}:${owner ?? ""}`;
    const mine = (tickets.current[key] ?? 0) + 1;
    tickets.current[key] = mine;
    return () => tickets.current[key] === mine;
  }, []);

  const storeEvent = useCallback((id: string, changes: Partial<SavedEvent>) =>
    update((s) => ({ events: s.events.map((e) => (e.id === id ? { ...e, ...changes } : e)) })), [update]);

  const dismissFailure = useCallback(() => patch({ failure: null }), [patch]);

  return { state, message, stateRef, announce, fail, update, patch, takeTicket, storeEvent, dismissFailure };
}

export type Store = ReturnType<typeof useStore>;
