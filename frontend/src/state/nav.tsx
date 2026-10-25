// Sections live in the URL hash (#budget), so the back button and bookmarks work.
// An "intent" opens a specific tool when arriving from the Add menu.

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export const SECTIONS = ["overview", "budget", "tasks", "vendors", "guests", "ideas"] as const;
export type Section = (typeof SECTIONS)[number];
export type Intent = "add-quote" | "add-guest" | "move-money" | "mark-booking" | null;

const fromHash = (): Section => {
  const name = location.hash.slice(1);
  return (SECTIONS as readonly string[]).includes(name) ? (name as Section) : "overview";
};

function useNavState() {
  const [section, setSection] = useState<Section>(fromHash);
  const [intent, setIntent] = useState<Intent>(null);

  useEffect(() => {
    const onHash = () => setSection(fromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Move focus to the new section's heading so keyboard and screen-reader users land there.
  useEffect(() => {
    document.querySelector<HTMLElement>("[data-section-title]")?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [section]);

  const go = useCallback((next: Section, nextIntent: Intent = null) => {
    setIntent(nextIntent);
    // Share links keep their query; only the hash changes.
    if (location.hash !== `#${next}`) history.pushState(null, "", `${location.pathname}${location.search}#${next}`);
    setSection(next);
  }, []);

  const consumeIntent = useCallback((wanted: Exclude<Intent, null>) => {
    if (intent !== wanted) return false;
    setIntent(null);
    return true;
  }, [intent]);

  return { section, intent, go, consumeIntent };
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
