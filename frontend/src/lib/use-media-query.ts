// Whether a media query matches, kept in step as the window resizes.

import { useSyncExternalStore } from "react";

/** The width at which the sidebar appears (Tailwind's `lg`). */
export const DESKTOP = "(min-width: 1024px)";

export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
  );
}
