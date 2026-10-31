// State for the Ask Higgins dock that doesn't depend on how it's drawn: the request to the AI
// and what came back, and the "Examples to try" menu under the field.

import { useCallback, useRef, useState, type FocusEvent, type KeyboardEvent, type RefObject } from "react";
import { api } from "@/lib/api";
import type { PlanRequest } from "@/lib/types";
import type { Outcome } from "./ask-review";
import { headline } from "./ask-words";

/** One request at a time. A reply that arrives after `drop()` (the dock closed) is ignored.
 *  `onAnswered` runs once a reply (or a failure) is in, to show the review card. */
export function useAskRequest(inputs: PlanRequest, enabled: boolean, onAnswered: () => void) {
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const ticket = useRef(0);

  const send = async (message: string) => {
    const asked = message.trim();
    if (!asked || busy || !enabled) return;
    const mine = ++ticket.current;
    setBusy(true);
    setOutcome(null);
    try {
      const response = await api.understand(asked, inputs);
      if (mine === ticket.current) setOutcome({ asked, response });
    } catch {
      if (mine === ticket.current) setOutcome({ asked, failed: true });
    } finally {
      if (mine === ticket.current) {
        setBusy(false);
        onAnswered();
      }
    }
  };

  // Stable, so the dock's close() (and what listens with it) doesn't change every render.
  const drop = useCallback(() => {
    ticket.current++;
    setBusy(false);
    setOutcome(null);
  }, []);

  // Something to apply only when the engine worked out a new plan with at least one change.
  const response = outcome?.response;
  const ready = response?.plan && response.changes && response.fields.length > 0 && !response.errors.length ? response : null;
  const title = response ? headline(response.fields, inputs) : "";

  return { busy, outcome, ready, title, send, drop, clear: () => setOutcome(null) };
}

/** The examples show while the cursor is in the empty field (or on an example), until Esc. Up
 *  from the field goes into the menu; up and down move through it, and down from the last
 *  example goes back to the field. */
export function useExamples(field: RefObject<HTMLTextAreaElement | null>, available: boolean) {
  const list = useRef<HTMLUListElement>(null);
  const [focusHere, setFocusHere] = useState(false);
  const [hidden, setHidden] = useState(false);
  const shown = available && focusHere && !hidden;

  const inside = (node: EventTarget | null) => node instanceof Node && (node === field.current || Boolean(list.current?.contains(node)));
  const buttons = () => [...(list.current?.querySelectorAll("button") ?? [])];

  return {
    list,
    shown,
    /** For the field and the menu: the cursor leaving both closes it. */
    onBlur: (event: FocusEvent) => !inside(event.relatedTarget) && setFocusHere(false),
    onFieldFocus: (event: FocusEvent) => {
      setFocusHere(true);
      if (!inside(event.relatedTarget)) setHidden(false);
    },
    /** True when the key was the menu's: Up into it, or Esc to hide it. */
    onFieldKey: (event: KeyboardEvent) => {
      if (!shown || (event.key !== "ArrowUp" && event.key !== "Escape")) return false;
      event.preventDefault();
      if (event.key === "ArrowUp") buttons().at(-1)?.focus();
      else setHidden(true);
      return true;
    },
    onExampleKey: (event: KeyboardEvent<HTMLButtonElement>) => {
      const all = buttons();
      const at = all.indexOf(event.currentTarget);
      if (event.key === "ArrowUp") all[Math.max(0, at - 1)].focus();
      else if (event.key === "ArrowDown") (all[at + 1] ?? field.current)?.focus();
      else if (event.key === "Escape") {
        setHidden(true);
        field.current?.focus();
      } else return;
      event.preventDefault();
    },
  };
}
