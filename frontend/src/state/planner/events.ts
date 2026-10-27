// Several saved events: switching, starting a new one, renaming, deleting (with undo) and
// keeping a shared plan as one of the organiser's own.

import { useCallback } from "react";
import { daysUntil, eventName } from "@/lib/format";
import { newEventId, type SavedEvent } from "@/lib/storage";
import type { Recalculate } from "./plan-actions";
import { allEvents, opened, type State, type Store } from "./store";

/** Upcoming events soonest first, then past ones, most recent first. */
export function orderEvents(events: SavedEvent[]) {
  const upcoming = (e: SavedEvent) => daysUntil(e.inputs.event_date) >= 0;
  return [...events].sort((a, b) =>
    upcoming(a) !== upcoming(b)
      ? (upcoming(a) ? -1 : 1)
      : (upcoming(a) ? 1 : -1) * a.inputs.event_date.localeCompare(b.inputs.event_date));
}

export function useEvents({ stateRef, announce, update, patch }: Store, recalculate: Recalculate) {
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
  }, [announce, openSaved, stateRef]);

  const startNewEvent = useCallback(() => {
    update((s) => ({ events: allEvents(s), ...opened(null), returnTo: s.activeId ?? s.returnTo }));
  }, [update]);

  const cancelNewEvent = useCallback(() => {
    const id = stateRef.current.returnTo;
    if (id) switchEvent(id);
  }, [stateRef, switchEvent]);

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
  }, [openSaved, patch, stateRef]);

  const undoDelete = useCallback(() => {
    const s = stateRef.current;
    const last = s.lastDeleted;
    if (!last) return;
    const events = [...allEvents(s)];
    events.splice(last.index, 0, last.event);
    if (last.wasOpen) openSaved(last.event, { events, lastDeleted: null });
    else patch({ events, lastDeleted: null });
    announce(`${eventName(last.event)} is back.`);
  }, [announce, openSaved, patch, stateRef]);

  const dismissDeleted = useCallback(() => patch({ lastDeleted: null }), [patch]);

  return { keepSharedPlan, switchEvent, startNewEvent, cancelNewEvent, renameEvent, deleteEvent, undoDelete, dismissDeleted };
}
