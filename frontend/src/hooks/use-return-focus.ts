// Dialogs often open from a button that is gone when they close: a menu item, or a task's
// "Mark booked" once it's booked. Focus would then drop to <body>, and a keyboard or screen
// reader user would lose their place. This sends it back to the opener, the menu's own button,
// or a fallback.

import { useCallback, useLayoutEffect, useRef } from "react";

export function useReturnFocus(open: boolean, fallback?: () => HTMLElement | null) {
  const opener = useRef<HTMLElement | null>(null);
  // A layout effect runs before the dialog moves focus inside, so this still sees the opener.
  useLayoutEffect(() => {
    if (!open) return;
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const menu = active?.closest("[role=menu]");
    opener.current = menu ? document.getElementById(menu.getAttribute("aria-labelledby") ?? "") : active;
  }, [open]);
  // After the dialog has gone (and anything it changed has rendered), so nothing moves focus again.
  return useCallback(() => {
    requestAnimationFrame(() => {
      const back = opener.current?.isConnected ? opener.current : fallback?.() ?? null;
      (back ?? document.querySelector<HTMLElement>("[data-section-title]"))?.focus();
    });
  }, [fallback]);
}
