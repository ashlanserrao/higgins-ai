// Changes to the open event's plan: recalculating, a plan from the questionnaire, confirmed
// changes, progress, undo and the guest list.

import { useCallback } from "react";
import { api } from "@/lib/api";
import { todayInIndia } from "@/lib/format";
import { newEventId } from "@/lib/storage";
import type { Guest, Plan, PlanRequest, Progress } from "@/lib/types";
import type { State, Store } from "./store";

const MAX_RECENT = 20;

export function usePlanActions(
  { stateRef, announce, fail, patch, takeTicket, storeEvent }: Store,
  fetchIdeas: (inputs: PlanRequest) => Promise<void>,
) {
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
  }, [patch, stateRef, storeEvent, takeTicket]);

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
  }, [announce, fetchIdeas, recalculate, stateRef]);

  /** The recent-changes list with one more at the top. */
  const noted = (label: string, summary: string[] = []) => [{ label, summary }, ...stateRef.current.recent].slice(0, MAX_RECENT);

  /** Keep a change the organiser confirmed in a before/after preview (plan already computed). */
  // biome-ignore lint/correctness/useExhaustiveDependencies: live state is read through stateRef, which never changes.
  const applyChange = useCallback((inputs: PlanRequest, plan: Plan, label: string, summary: string[]) => {
    const previous = stateRef.current.inputs;
    takeTicket("plan", stateRef.current.activeId);
    patch({ inputs, plan, lastChange: previous ? { label, summary, previous } : null, recent: noted(label, summary) });
  }, [patch, takeTicket]);

  /** Bookings, quotes and moves: change progress, then recalculate. */
  // biome-ignore lint/correctness/useExhaustiveDependencies: live state is read through stateRef, which never changes.
  const updateProgress = useCallback(async (change: (progress: Progress) => Progress, label: string) => {
    const previous = stateRef.current.inputs;
    if (!previous) return;
    const inputs = { ...previous, progress: change(structuredClone(previous.progress)) };
    await recalculate(inputs, { lastChange: { label, summary: [], previous }, recent: noted(label) });
  }, [recalculate]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: live state is read through stateRef, which never changes.
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

  const setGuests = useCallback((guests: Guest[]) => patch({ guests }), [patch]);

  return { recalculate, makePlan, applyChange, updateProgress, undo, setGuests };
}

export type Recalculate = ReturnType<typeof usePlanActions>["recalculate"];
