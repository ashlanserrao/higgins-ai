// App state and every action that changes it. The browser is the only store: inputs
// (including progress) go to the API on each change and the rules-based plan comes back.
// Several events can be saved. The open one is a working copy; the rest wait in `events`,
// and a response for an event that has since been closed goes into its saved copy.

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { api, ApiError } from "@/lib/api";
import { daysUntil, eventName, todayInIndia } from "@/lib/format";
import { readSharedIdeas, readSharedInputs } from "@/lib/share";
import { newEventId, storage, type SavedEvent } from "@/lib/storage";
import type { EventIdeas, Guest, Options, Plan, PlanRequest, Progress } from "@/lib/types";
import { readRoute } from "./nav";

export type IdeasStatus = "idle" | "loading" | "ready" | "stale" | "failed" | "unavailable";

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
const MAX_RECENT = 20;

/** A deleted event, kept in memory so it can be undone. */
export interface DeletedEvent {
  event: SavedEvent;
  index: number;
  wasOpen: boolean;
}

interface State {
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

/** Ideas depend on the plan inputs, not on bookings or quotes made since. */
const ideasKey = ({ progress: _progress, ...inputs }: PlanRequest) => JSON.stringify(inputs);

/** The working copy for an event, or a blank one for planning a new event. */
const opened = (event: SavedEvent | null): Partial<State> => ({
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
function allEvents(s: State): SavedEvent[] {
  if (!s.activeId || s.shared || !s.inputs || !s.plan) return s.events;
  const open: SavedEvent = {
    id: s.activeId, name: s.events.find((e) => e.id === s.activeId)?.name ?? "", savedOn: todayInIndia(),
    inputs: s.inputs, plan: s.plan, aiAvailable: s.aiAvailable, ideas: s.ideas, ideasFor: s.ideasFor,
    plannedOn: s.plannedOn, guests: s.guests,
  };
  return s.events.some((e) => e.id === open.id) ? s.events.map((e) => (e.id === open.id ? open : e)) : [...s.events, open];
}

/** Upcoming events soonest first, then past ones, most recent first. */
export function orderEvents(events: SavedEvent[]) {
  const upcoming = (e: SavedEvent) => daysUntil(e.inputs.event_date) >= 0;
  return [...events].sort((a, b) =>
    upcoming(a) !== upcoming(b)
      ? (upcoming(a) ? -1 : 1)
      : (upcoming(a) ? 1 : -1) * a.inputs.event_date.localeCompare(b.inputs.event_date));
}

function usePlannerState() {
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

  const fetchIdeas = useCallback(async (inputs: PlanRequest) => {
    const owner = stateRef.current.activeId;
    const isLatest = takeTicket("ideas", owner);
    const key = owner ?? "";
    const stillOpen = () => stateRef.current.activeId === owner;
    const settle = (s: State) => (s.ideasLoadingFor === key ? null : s.ideasLoadingFor);
    patch({ ideasLoadingFor: key, ideasFailed: false });
    try {
      const response = await api.ideas(inputs);
      if (!isLatest()) return;
      const found = response.ideas ? { ideas: response.ideas, ideasFor: ideasKey(inputs) } : {};
      if (!stillOpen()) {
        if (owner) storeEvent(owner, found);
        update((s) => ({ ideasLoadingFor: settle(s) }));
        return;
      }
      update((s) => ({ ideasLoadingFor: settle(s), ideasFailed: !response.ideas, aiAvailable: response.ai_available, ...found }));
      announce(response.ideas ? "Your ideas are ready." : "We couldn't generate ideas this time.");
    } catch (error) {
      if (!isLatest()) return;
      update((s) => ({ ideasLoadingFor: settle(s), ...(stillOpen() ? { ideasFailed: true } : {}) }));
      if (stillOpen()) announce((error as Error).message);
    }
  }, [announce, patch, storeEvent, takeTicket, update]);

  const loadIdeas = useCallback(() => {
    const inputs = stateRef.current.inputs;
    if (inputs) void fetchIdeas(inputs);
  }, [fetchIdeas]);

  /** Recalculate the plan for new inputs. Throws ApiError so the caller can show it in place. */
  const recalculate = useCallback(async (inputs: PlanRequest, extra: Partial<State> = {}) => {
    const owner = stateRef.current.activeId;
    const isLatest = takeTicket("plan", owner);
    const response = await api.plan(inputs);
    if (!isLatest()) return null;
    if (stateRef.current.activeId !== owner) {
      if (owner) storeEvent(owner, { inputs, plan: response.plan, savedOn: todayInIndia() });
      return null;
    }
    patch({ inputs, plan: response.plan, aiAvailable: response.ai_available, ...extra });
    return response;
  }, [patch, storeEvent, takeTicket]);

  /** A closed event's plan, worked out again for today. Its saved plan stays if that fails. */
  const refreshEvent = useCallback(async (event: SavedEvent) => {
    try {
      const response = await api.plan(event.inputs);
      storeEvent(event.id, { plan: response.plan, savedOn: todayInIndia() });
    } catch {
      /* past event or offline */
    }
  }, [storeEvent]);

  /** A plan from the questionnaire. Same event type keeps progress (the caller decides). */
  const makePlan = useCallback(async (inputs: PlanRequest, options: { fresh: boolean; guests?: Guest[] }) => {
    const response = await recalculate(inputs, {
      activeId: stateRef.current.activeId ?? newEventId(), // a new event, or a shared plan being changed
      shared: false,
      returnTo: null,
      lastChange: null,
      recent: [],
      ...(options.fresh ? { plannedOn: todayInIndia(), ideas: null, ideasFor: null, ideasFailed: false } : {}),
      ...(options.guests ? { guests: options.guests } : {}),
    });
    if (!response) return;
    const { plan } = response;
    history.replaceState(null, "", location.pathname + location.hash);
    announce(`Plan ready: ${plan.days_remaining} days to go${plan.triage.active ? ", with items to book today" : ""}.`);
    // Read availability from this response: state from the same tick isn't rendered yet.
    if (options.fresh && response.ai_available) void fetchIdeas(inputs);
  }, [announce, fetchIdeas, recalculate]);

  /** The recent-changes list with one more at the top. */
  const noted = (label: string, summary: string[] = []) => [{ label, summary }, ...stateRef.current.recent].slice(0, MAX_RECENT);

  /** Keep a change the organiser confirmed in a before/after preview (plan already computed). */
  const applyChange = useCallback((inputs: PlanRequest, plan: Plan, label: string, summary: string[]) => {
    const previous = stateRef.current.inputs;
    takeTicket("plan", stateRef.current.activeId);
    patch({ inputs, plan, lastChange: previous ? { label, summary, previous } : null, recent: noted(label, summary) });
  }, [announce, patch, takeTicket]);

  /** Bookings, quotes and moves: change progress, then recalculate. */
  const updateProgress = useCallback(async (change: (progress: Progress) => Progress, label: string) => {
    const previous = stateRef.current.inputs;
    if (!previous) return;
    const inputs = { ...previous, progress: change(structuredClone(previous.progress)) };
    await recalculate(inputs, { lastChange: { label, summary: [], previous }, recent: noted(label) });
  }, [recalculate]);

  const undo = useCallback(async () => {
    const last = stateRef.current.lastChange;
    if (!last) return;
    try {
      await recalculate(last.previous, { lastChange: null, recent: noted(`Undid: ${last.label}`) });
      announce(`Undone: ${last.label}.`);
    } catch (error) {
      fail(`Couldn't undo “${last.label}”. ${(error as Error).message}`);
    }
  }, [announce, fail, recalculate]);

  const dismissFailure = useCallback(() => patch({ failure: null }), [patch]);

  const setGuests = useCallback((guests: Guest[]) => patch({ guests }), [patch]);

  const keepSharedPlan = useCallback(() => {
    history.replaceState(null, "", location.pathname);
    patch({ shared: false, activeId: newEventId(), returnTo: null });
    announce("This plan is now one of your events, saved in this browser.");
  }, [announce, patch]);

  /** Open another saved event; recalculated against today, its saved plan shows meanwhile. */
  const openSaved = useCallback((event: SavedEvent, changes: Partial<State> = {}) => {
    update((s) => ({ ...changes, ...opened(event), aiAvailable: s.aiAvailable }));
    recalculate(event.inputs).catch(() => {
      /* past event or offline: the saved plan stays */
    });
  }, [recalculate, update]);

  const switchEvent = useCallback((id: string) => {
    const s = stateRef.current;
    const events = allEvents(s);
    const event = events.find((e) => e.id === id);
    if (!event || id === s.activeId) return;
    openSaved(event, { events });
    announce(`Now planning ${eventName(event)}.`);
  }, [announce, openSaved]);

  const startNewEvent = useCallback(() => {
    update((s) => ({ events: allEvents(s), ...opened(null), returnTo: s.activeId ?? s.returnTo }));
  }, [update]);

  const cancelNewEvent = useCallback(() => {
    const id = stateRef.current.returnTo;
    if (id) switchEvent(id);
  }, [switchEvent]);

  const renameEvent = useCallback((id: string, name: string) => {
    update((s) => ({ events: allEvents(s).map((e) => (e.id === id ? { ...e, name: name.trim() } : e)) }));
    announce("Name saved.");
  }, [announce, update]);

  const deleteEvent = useCallback((id: string) => {
    const s = stateRef.current;
    const events = allEvents(s);
    const index = events.findIndex((e) => e.id === id);
    if (index < 0) return;
    const event = events[index];
    const rest = events.filter((e) => e.id !== id);
    const wasOpen = id === s.activeId;
    const changes = { events: rest, lastDeleted: { event, index, wasOpen } };
    const next = orderEvents(rest)[0];
    if (!wasOpen) patch(changes);
    else if (next) openSaved(next, changes);
    else patch({ ...changes, ...opened(null) });
  }, [openSaved, patch]);

  const undoDelete = useCallback(() => {
    const s = stateRef.current;
    const last = s.lastDeleted;
    if (!last) return;
    const events = [...allEvents(s)];
    events.splice(last.index, 0, last.event);
    if (last.wasOpen) openSaved(last.event, { events, lastDeleted: null });
    else patch({ events, lastDeleted: null });
    announce(`${eventName(last.event)} is back.`);
  }, [announce, openSaved, patch]);

  const dismissDeleted = useCallback(() => patch({ lastDeleted: null }), [patch]);

  // Start: options, then a shared link, the event in the URL or the last one open, or nothing.
  useEffect(() => {
    (async () => {
      let options: Options;
      try {
        options = await api.options();
      } catch (error) {
        patch({ booting: false, bootError: (error as Error).message });
        return;
      }
      const shared = readSharedInputs();
      const saved = storage.load();
      const wanted = readRoute().eventId;
      const open = saved.events.find((e) => e.id === wanted) ?? saved.events.find((e) => e.id === saved.activeEventId) ?? saved.events[0];
      patch({ options, events: saved.events });
      if (shared) {
        const ideas = await readSharedIdeas();
        patch({ shared: true, returnTo: open?.id ?? null, plannedOn: shared.plannedOn || todayInIndia(), ideas });
        try {
          // Recalculated against today; ideas come from the link, not a new AI call.
          await recalculate(shared.inputs, { ideasFor: ideas ? ideasKey(shared.inputs) : null });
        } catch (error) {
          const message = `This shared plan can't be shown: ${(error as Error).message} Change the details to make a new plan.`;
          patch({ inputs: shared.inputs, bootError: message });
        }
      } else if (open) {
        patch({ ...opened(open), aiAvailable: open.aiAvailable, plan: null });
        try {
          await recalculate(open.inputs);
        } catch {
          // Past event or offline: show the last saved plan as it was.
          patch({ plan: open.plan });
        }
      }
      patch({ booting: false });
      // The switcher counts today's to-dos, so plans worked out on an earlier day are redone.
      const today = todayInIndia();
      for (const event of saved.events) {
        if (event.id !== stateRef.current.activeId && event.savedOn !== today) void refreshEvent(event);
      }
    })();
  }, [patch, recalculate, refreshEvent]);

  // Save on every change. A shared plan isn't saved until it's kept.
  useEffect(() => {
    if (state.booting) return;
    storage.save({ activeEventId: state.activeId ?? state.returnTo, events: allEvents(state) });
  }, [state]);

  const ideasStatus: IdeasStatus = state.ideasLoadingFor !== null && state.ideasLoadingFor === (state.activeId ?? "")
    ? "loading"
    : state.ideasFailed
      ? "failed"
      : state.ideas
        ? state.inputs && state.ideasFor === ideasKey(state.inputs) ? "ready" : "stale"
        : state.aiAvailable ? "idle" : "unavailable";

  return {
    ...state, events: allEvents(state), ideasStatus, message,
    announce, fail, dismissFailure, makePlan, applyChange, updateProgress, undo, loadIdeas, setGuests, keepSharedPlan,
    switchEvent, startNewEvent, cancelNewEvent, renameEvent, deleteEvent, undoDelete, dismissDeleted,
  };
}

export type Planner = ReturnType<typeof usePlannerState>;

const PlannerContext = createContext<Planner | null>(null);

export function PlannerProvider({ children }: { children: ReactNode }) {
  const planner = usePlannerState();
  return <PlannerContext.Provider value={planner}>{children}</PlannerContext.Provider>;
}

export function usePlanner() {
  const planner = useContext(PlannerContext);
  if (!planner) throw new Error("usePlanner must be used inside PlannerProvider");
  return planner;
}

/** For screens that only render once a plan exists. */
export function usePlan() {
  const planner = usePlanner();
  const { inputs, plan } = planner;
  if (!inputs || !plan) throw new Error("usePlan needs a plan");
  return { ...planner, inputs, plan };
}

export { ApiError };
