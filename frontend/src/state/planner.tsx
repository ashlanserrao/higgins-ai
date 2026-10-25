// App state and every action that changes it. The browser is the only store: inputs
// (including progress) go to the API on each change and the rules-based plan comes back.

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { api, ApiError } from "@/lib/api";
import { todayInIndia } from "@/lib/format";
import { readSharedIdeas, readSharedInputs } from "@/lib/share";
import { storage } from "@/lib/storage";
import type { EventIdeas, Guest, Options, Plan, PlanRequest, Progress } from "@/lib/types";

export type IdeasStatus = "idle" | "loading" | "ready" | "stale" | "failed" | "unavailable";

/** The last change the organiser applied, so the dashboard can say what moved and undo it. */
export interface LastChange {
  label: string;
  summary: string[];
  previous: PlanRequest;
}

interface State {
  booting: boolean;
  bootError: string;
  options: Options | null;
  inputs: PlanRequest | null;
  plan: Plan | null;
  aiAvailable: boolean;
  ideas: EventIdeas | null;
  ideasFor: string | null;
  ideasLoading: boolean;
  ideasFailed: boolean;
  plannedOn: string;
  guests: Guest[];
  shared: boolean; // viewing someone's link: never overwrite the viewer's own saved plan
  lastChange: LastChange | null;
}

const initialState: State = {
  booting: true, bootError: "", options: null, inputs: null, plan: null, aiAvailable: false,
  ideas: null, ideasFor: null, ideasLoading: false, ideasFailed: false, plannedOn: todayInIndia(),
  guests: [], shared: false, lastChange: null,
};

/** Ideas depend on the plan inputs, not on bookings or quotes made since. */
const ideasKey = ({ progress: _progress, ...inputs }: PlanRequest) => JSON.stringify(inputs);

function usePlannerState() {
  const [state, setState] = useState<State>(initialState);
  const [message, setMessage] = useState("");
  // Each plan request gets a number, so a slow, outdated response never overwrites a newer one.
  const planTicket = useRef(0);
  const ideasTicket = useRef(0);
  const stateRef = useRef(state);
  stateRef.current = state;

  const announce = useCallback((text: string) => setMessage(text), []);
  const patch = useCallback((changes: Partial<State>) => setState((s) => ({ ...s, ...changes })), []);

  const fetchIdeas = useCallback(async (inputs: PlanRequest) => {
    const ticket = ++ideasTicket.current;
    patch({ ideasLoading: true, ideasFailed: false });
    try {
      const response = await api.ideas(inputs);
      if (ticket !== ideasTicket.current) return;
      patch({
        ideasLoading: false,
        ideasFailed: !response.ideas,
        aiAvailable: response.ai_available,
        ...(response.ideas ? { ideas: response.ideas, ideasFor: ideasKey(inputs) } : {}),
      });
      announce(response.ideas ? "Your ideas are ready." : "We couldn't generate ideas this time.");
    } catch (error) {
      if (ticket !== ideasTicket.current) return;
      patch({ ideasLoading: false, ideasFailed: true });
      announce((error as Error).message);
    }
  }, [announce, patch]);

  const loadIdeas = useCallback(() => {
    const inputs = stateRef.current.inputs;
    if (inputs) void fetchIdeas(inputs);
  }, [fetchIdeas]);

  /** Recalculate the plan for new inputs. Throws ApiError so the caller can show it in place. */
  const recalculate = useCallback(async (inputs: PlanRequest, extra: Partial<State> = {}) => {
    const ticket = ++planTicket.current;
    const response = await api.plan(inputs);
    if (ticket !== planTicket.current) return null;
    patch({ inputs, plan: response.plan, aiAvailable: response.ai_available, ...extra });
    return response;
  }, [patch]);

  /** A new plan from the questionnaire. Same event type keeps progress (the caller decides). */
  const makePlan = useCallback(async (inputs: PlanRequest, options: { fresh: boolean; guests?: Guest[] }) => {
    const response = await recalculate(inputs, {
      shared: false,
      lastChange: null,
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

  /** Keep a change the organiser confirmed in a before/after preview (plan already computed). */
  const applyChange = useCallback((inputs: PlanRequest, plan: Plan, label: string, summary: string[]) => {
    const previous = stateRef.current.inputs;
    planTicket.current++;
    patch({ inputs, plan, lastChange: previous ? { label, summary, previous } : null });
    announce(`${label}. ${summary.join(" ")}`);
  }, [announce, patch]);

  /** Bookings, quotes and moves: change progress, then recalculate. */
  const updateProgress = useCallback(async (change: (progress: Progress) => Progress, label: string) => {
    const previous = stateRef.current.inputs;
    if (!previous) return;
    const inputs = { ...previous, progress: change(structuredClone(previous.progress)) };
    const plan = (await recalculate(inputs, { lastChange: { label, summary: [], previous } }))?.plan;
    if (plan) announce(`${label}. ${plan.warnings.length ? plan.warnings[plan.warnings.length - 1] : ""}`);
  }, [announce, recalculate]);

  const undo = useCallback(async () => {
    const last = stateRef.current.lastChange;
    if (!last) return;
    await recalculate(last.previous, { lastChange: null });
    announce(`Undone: ${last.label}.`);
  }, [announce, recalculate]);

  const setGuests = useCallback((guests: Guest[]) => patch({ guests }), [patch]);

  const keepSharedPlan = useCallback(() => {
    history.replaceState(null, "", location.pathname);
    patch({ shared: false });
    announce("This plan is now saved in your browser.");
  }, [announce, patch]);

  const startOver = useCallback(() => {
    storage.clear();
    history.replaceState(null, "", location.pathname);
    planTicket.current++;
    ideasTicket.current++;
    setState((s) => ({ ...initialState, booting: false, options: s.options }));
  }, []);

  // Start: options, then a shared link, a saved plan, or nothing (questionnaire).
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
      if (shared) {
        const ideas = await readSharedIdeas();
        patch({ options, shared: true, plannedOn: shared.plannedOn || todayInIndia(), ideas });
        try {
          // Recalculated against today; ideas come from the link, not a new AI call.
          await recalculate(shared.inputs, { ideasFor: ideas ? ideasKey(shared.inputs) : null });
        } catch (error) {
          const message = `This shared plan can't be shown: ${(error as Error).message} Change the details to make a new plan.`;
          patch({ inputs: shared.inputs, bootError: message });
        }
      } else if (saved) {
        patch({ options, ...saved, plan: null });
        try {
          await recalculate(saved.inputs);
        } catch {
          // Past event or offline: show the last saved plan as it was.
          patch({ plan: saved.plan });
        }
      } else {
        patch({ options });
      }
      patch({ booting: false });
    })();
  }, [patch, recalculate]);

  // Save on every change, except while viewing someone else's link.
  useEffect(() => {
    const { booting, shared, inputs, plan, aiAvailable, ideas, ideasFor, plannedOn, guests } = state;
    if (booting || shared || !inputs || !plan) return;
    storage.save({ inputs, plan, aiAvailable, ideas, ideasFor, plannedOn, guests });
  }, [state]);

  const ideasStatus: IdeasStatus = state.ideasLoading
    ? "loading"
    : state.ideasFailed
      ? "failed"
      : state.ideas
        ? state.inputs && state.ideasFor === ideasKey(state.inputs) ? "ready" : "stale"
        : state.aiAvailable ? "idle" : "unavailable";

  return {
    ...state, ideasStatus, message,
    announce, makePlan, applyChange, updateProgress, undo, loadIdeas, setGuests, keepSharedPlan, startOver,
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
