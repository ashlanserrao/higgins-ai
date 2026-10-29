// App state and every action that changes it. The browser is the only store: inputs
// (including progress) go to the API on each change and the rules-based plan comes back.
// Several events can be saved. The open one is a working copy; the rest wait in `events`,
// and a response for an event that has since been closed goes into its saved copy.

import { createContext, useContext, type ReactNode } from "react";
import { ApiError } from "@/lib/api";
import { useEvents } from "./events";
import { useIdeas } from "./ideas";
import { useBoot, useSave } from "./persistence";
import { usePlanActions } from "./plan-actions";
import { allEvents, useStore } from "./store";

export { orderEvents } from "./events";
export type { IdeasStatus } from "./ideas";
export type { DeletedEvent, LastChange, RecentChange } from "./store";

function usePlannerState(owner: string | null) {
  const store = useStore();
  const { state, message, announce, fail, dismissFailure } = store;
  const { fetchIdeas, loadIdeas, ideasStatus } = useIdeas(store);
  const { recalculate, makePlan, applyChange, updateProgress, undo, setGuests } = usePlanActions(store, fetchIdeas);
  const events = useEvents(store, recalculate);
  useBoot(store, recalculate, owner);
  useSave(state, owner);

  return {
    ...state, events: allEvents(state), ideasStatus, message,
    announce, fail, dismissFailure, makePlan, applyChange, updateProgress, undo, loadIdeas, setGuests,
    ...events, // keepSharedPlan, switchEvent, startNewEvent, cancelNewEvent, renameEvent, deleteEvent, undoDelete, dismissDeleted
  };
}

export type Planner = ReturnType<typeof usePlannerState>;

const PlannerContext = createContext<Planner | null>(null);

/** `owner`: the signed-in account, whose events load and save; null when signed out. Mount it
 *  once per account (a `key`), so switching accounts starts from that account's events. */
export function PlannerProvider({ owner, children }: { owner: string | null; children: ReactNode }) {
  const planner = usePlannerState(owner);
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
