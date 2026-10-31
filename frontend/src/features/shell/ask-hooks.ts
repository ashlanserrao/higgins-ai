// Page-wide behaviour for the Ask Higgins dock: the "/" shortcut, and the phone sheet's place
// above the on-screen keyboard.

import { useEffect, type RefObject } from "react";

const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement && Boolean(target.closest("input, textarea, select, [contenteditable=true]"));

/** "/" calls `onSlash` from anywhere except a text field. */
export function useSlashKey(onSlash: () => void) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey || typing(event.target)) return;
      event.preventDefault();
      onSlash();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onSlash]);
}

/** While `active`, the sheet stays above the on-screen keyboard (as `--ask-kb`), and a tap
 *  outside it closes it without moving focus. */
export function usePhoneSheet(sheet: RefObject<HTMLElement | null>, active: boolean, close: (refocus: boolean) => void) {
  useEffect(() => {
    const el = sheet.current;
    const viewport = window.visualViewport;
    if (!active || !el) return;
    const place = () => viewport && el.style.setProperty("--ask-kb", `${Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)}px`);
    const outside = (event: PointerEvent) => !el.contains(event.target as Node) && close(false);
    place();
    viewport?.addEventListener("resize", place);
    viewport?.addEventListener("scroll", place);
    document.addEventListener("pointerdown", outside);
    return () => {
      viewport?.removeEventListener("resize", place);
      viewport?.removeEventListener("scroll", place);
      document.removeEventListener("pointerdown", outside);
      el.style.removeProperty("--ask-kb");
    };
  }, [sheet, active, close]);
}
