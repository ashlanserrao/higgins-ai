// Loading at start and saving on every change. The browser is the only store.

import { useCallback, useEffect } from "react";
import { api, errorMessage } from "@/lib/api";
import { todayInIndia } from "@/lib/format";
import { readSharedIdeas, readSharedInputs } from "@/lib/share";
import { storage, type SavedEvent } from "@/lib/storage";
import type { Options } from "@/lib/types";
import { readRoute } from "../nav";
import { ideasKey } from "./ideas";
import type { Recalculate } from "./plan-actions";
import { allEvents, opened, type State, type Store } from "./store";

/** Start: options, then a shared link, the event in the URL or the last one open, or nothing. */
export function useBoot({ stateRef, patch, storeEvent, fail }: Store, recalculate: Recalculate, owner: string | null) {
  /** A closed event's plan, worked out again for today. Its saved plan stays if that fails. */
  const refreshEvent = useCallback(async (event: SavedEvent) => {
    try {
      const response = await api.plan(event.inputs);
      storeEvent(event.id, { plan: response.plan, savedOn: todayInIndia() });
    } catch {
      /* past event or offline */
    }
  }, [storeEvent]);

  useEffect(() => {
    (async () => {
      let options: Options;
      try {
        options = await api.options();
      } catch (error) {
        patch({ booting: false, bootError: errorMessage(error) });
        return;
      }
      let shared = readSharedInputs();
      if (shared === "broken") {
        // Opens as if there were no link, with a note that stays until it's closed.
        history.replaceState(null, "", `${location.pathname}${location.hash}`);
        fail("This shared link is incomplete or has been changed, so it can't be opened. Ask for a new link.");
        shared = null;
      }
      const saved = storage.load(owner);
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
          const message = `This shared plan can't be shown: ${errorMessage(error)} Change the details to make a new plan.`;
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
  }, [patch, fail, recalculate, refreshEvent, stateRef, owner]);
}

/** Save on every change, under the signed-in account. A shared plan isn't saved until it's kept. */
export function useSave(state: State, owner: string | null) {
  useEffect(() => {
    if (state.booting) return;
    storage.save(owner, { activeEventId: state.activeId ?? state.returnTo, events: allEvents(state) });
  }, [state, owner]);
}
