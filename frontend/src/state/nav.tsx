// The open event and section live in the URL hash (#/event/3f9c2a1b/budget), so the back
// button, bookmarks and links work. An "intent" opens a specific tool when arriving from
// the Add menu. Old links (#budget) and shared plans (no event yet) use the section alone.

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export const SECTIONS = ["overview", "budget", "tasks", "vendors", "guests", "ideas"] as const;
export type Section = (typeof SECTIONS)[number];
export type Intent = "add-quote" | "add-guest" | "move-money" | "mark-booking" | null;

interface Route {
  eventId: string | null;
  section: Section;
}

export function readRoute(hash = location.hash): Route {
  const match = hash.match(/^#\/event\/([\w-]+)(?:\/(\w+))?$/);
  const name = match ? match[2] : hash.slice(1);
  const section = (SECTIONS as readonly string[]).includes(name) ? (name as Section) : "overview";
  return { eventId: match?.[1] ?? null, section };
}

export const routeHash = ({ eventId, section }: Route) => (eventId ? `#/event/${eventId}/${section}` : `#${section}`);

function useNavState() {
  const [route, setRoute] = useState<Route>(() => readRoute());
  const [intent, setIntent] = useState<Intent>(null);
  const { section, eventId } = route;

  useEffect(() => {
    const onHash = () => setRoute(readRoute());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Move focus to the new section's heading so keyboard and screen-reader users land there.
  useEffect(() => {
    document.querySelector<HTMLElement>("[data-section-title]")?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [section]);

  const visit = useCallback((next: Route, replace = false) => {
    const hash = routeHash(next);
    // A shared link keeps its query until it's kept as an event.
    const url = `${location.pathname}${next.eventId ? "" : location.search}${hash}`;
    if (location.hash !== hash) history[replace ? "replaceState" : "pushState"](null, "", url);
    setRoute(next);
  }, []);

  const go = useCallback((next: Section, nextIntent: Intent = null) => {
    setIntent(nextIntent);
    visit({ eventId, section: next });
  }, [eventId, visit]);

  /** Same section, another event. */
  const openEvent = useCallback((id: string, replace = false) => visit({ eventId: id, section }, replace), [section, visit]);

  const consumeIntent = useCallback((wanted: Exclude<Intent, null>) => {
    if (intent !== wanted) return false;
    setIntent(null);
    return true;
  }, [intent]);

  return { section, eventId, intent, go, openEvent, consumeIntent };
}

const NavContext = createContext<ReturnType<typeof useNavState> | null>(null);

export function NavProvider({ children }: { children: ReactNode }) {
  return <NavContext.Provider value={useNavState()}>{children}</NavContext.Provider>;
}

export function useNav() {
  const nav = useContext(NavContext);
  if (!nav) throw new Error("useNav must be used inside NavProvider");
  return nav;
}
