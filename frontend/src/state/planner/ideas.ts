// AI ideas: fetched after the plan is on screen, kept per event, and marked stale once the
// inputs they were made for change.

import { useCallback } from "react";
import { api } from "@/lib/api";
import type { PlanRequest } from "@/lib/types";
import type { State, Store } from "./store";

export type IdeasStatus = "idle" | "loading" | "ready" | "stale" | "failed" | "unavailable";

/** Ideas depend on the plan inputs, not on bookings or quotes made since. */
export const ideasKey = ({ progress: _progress, ...inputs }: PlanRequest) => JSON.stringify(inputs);

function ideasStatusOf(state: State): IdeasStatus {
  return state.ideasLoadingFor !== null && state.ideasLoadingFor === (state.activeId ?? "")
    ? "loading"
    : state.ideasFailed
      ? "failed"
      : state.ideas
        ? state.inputs && state.ideasFor === ideasKey(state.inputs) ? "ready" : "stale"
        : state.aiAvailable ? "idle" : "unavailable";
}

export function useIdeas({ state, stateRef, announce, update, patch, takeTicket, storeEvent }: Store) {
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
  }, [announce, patch, stateRef, storeEvent, takeTicket, update]);

  const loadIdeas = useCallback(() => {
    const inputs = stateRef.current.inputs;
    if (inputs) void fetchIdeas(inputs);
  }, [fetchIdeas, stateRef]);

  return { fetchIdeas, loadIdeas, ideasStatus: ideasStatusOf(state) };
}
