// Floating confirmations: a change applied (with Undo), an event deleted (with Undo), and
// failures. They sit in a fixed layer at the foot of the content area, so they never move the
// page. Success toasts leave after 6 seconds (held while hovered or focused); failures stay until
// closed. One of each kind at a time, so at most three. Ctrl/Cmd+Z undoes the newest while it shows.
// Changes the engine makes on its own (a quote under its estimate) never toast: they stay in the
// note under the budget bar and in "Recent changes".

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/badges";
import { eventName } from "@/lib/format";
import { cn } from "@/lib/utils";
import { usePlanner, type LastChange } from "@/state/planner";

const SHOW_MS = 6000;
const LEAVE_MS = 180;

/** One toast. `onClose` runs once its exit animation has played. */
function Toast({ tone, autoClose, onClose, children, actions }: {
  tone: "success" | "danger"; autoClose: boolean; onClose: () => void; children: ReactNode; actions?: ReactNode;
}) {
  const [leaving, setLeaving] = useState(false);
  const [held, setHeld] = useState(false);
  const remaining = useRef(SHOW_MS);
  const close = useCallback(() => {
    setLeaving(true);
    window.setTimeout(onClose, LEAVE_MS);
  }, [onClose]);

  // Counts down only while nobody is pointing at it or working inside it.
  useEffect(() => {
    if (!autoClose || held || leaving) return;
    const started = Date.now();
    const timer = window.setTimeout(close, remaining.current);
    return () => {
      window.clearTimeout(timer);
      remaining.current -= Date.now() - started;
    };
  }, [autoClose, held, leaving, close]);

  return (
    <div
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setHeld(false)}
      className={cn(
        "pointer-events-auto flex w-full max-w-[560px] flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border bg-popover px-4 py-2.5 text-sm shadow-raised duration-180",
        // Dark lifts by a lighter surface, not a heavier shadow, so it stands off the dark card.
        "[[data-theme=dark]_&]:border-(--hairline-strong) [[data-theme=dark]_&]:bg-surface-soft",
        leaving ? "animate-out fade-out-0 slide-out-to-bottom-2.5 fill-mode-forwards" : "animate-in fade-in-0 slide-in-from-bottom-2.5",
      )}
    >
      <StatusBadge tone={tone} className="shrink-0">{tone === "success" ? "Done" : "Couldn't do that"}</StatusBadge>
      {/* On a phone the message takes its own row under the chip and buttons. */}
      <p className="order-last basis-full sm:order-none sm:min-w-0 sm:flex-1 sm:basis-0">{children}</p>
      <div className="ml-auto flex items-center gap-1">
        {actions}
        <Button size="icon-sm" variant="ghost" onClick={close} aria-label="Close"><X aria-hidden="true" /></Button>
      </div>
    </div>
  );
}

const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement && Boolean(target.closest("input, textarea, select, [contenteditable=true]"));

export function Toaster() {
  const { lastChange, undo, lastDeleted, undoDelete, dismissDeleted, failure, dismissFailure } = usePlanner();
  // A fresh key per change or deletion, so a repeat of the same one starts a fresh toast.
  const ids = useRef({ map: new WeakMap<object, number>(), next: 0 });
  const idOf = (item: object) => {
    const { map } = ids.current;
    if (!map.has(item)) map.set(item, ++ids.current.next);
    return map.get(item);
  };
  // A change toast closes without forgetting the change, so remember which one was closed.
  const [closedChange, setClosedChange] = useState<LastChange | null>(null);
  const change = lastChange && lastChange !== closedChange ? lastChange : null;
  // Which undoable toast arrived last, for Ctrl/Cmd+Z.
  const newest = useRef<"change" | "deleted" | null>(null);
  useEffect(() => { if (change) newest.current = "change"; }, [change]);
  useEffect(() => { if (lastDeleted) newest.current = "deleted"; }, [lastDeleted]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "z" || !(event.ctrlKey || event.metaKey) || event.shiftKey || typing(event.target)) return;
      const which = change && lastDeleted ? newest.current : change ? "change" : lastDeleted ? "deleted" : null;
      if (!which) return;
      event.preventDefault();
      if (which === "change") void undo();
      else undoDelete();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [change, lastDeleted, undo, undoDelete]);

  const closeChange = useCallback(() => setClosedChange(lastChange), [lastChange]);

  return createPortal(
    <div
      className={cn(
        // No gap here: with nothing showing the layer is 0px tall, so a toast arriving moves nothing.
        "no-print pointer-events-none fixed inset-x-0 z-40 flex flex-col items-center px-(--page-gutter)",
        // Above the phone's bottom navigation; on a desktop, centred on the content beside the sidebar.
        "bottom-[calc(env(safe-area-inset-bottom)+5rem)] lg:bottom-6 lg:pl-[calc(260px+var(--page-gutter))]",
      )}
    >
      {/* Both regions are always mounted, so screen readers hear each toast as it arrives. */}
      <div role="alert" className={cn("flex w-full flex-col items-center", failure && (lastDeleted || change) && "mb-2")}>
        {failure && <Toast key={failure.id} tone="danger" autoClose={false} onClose={dismissFailure}>{failure.text}</Toast>}
      </div>
      <div role="status" aria-live="polite" className="flex w-full flex-col items-center gap-2">
        {lastDeleted && (
          <Toast key={idOf(lastDeleted)} tone="success" autoClose onClose={dismissDeleted}
            actions={<Button size="sm" variant="outline" onClick={undoDelete}><Undo2 aria-hidden="true" /> Undo</Button>}>
            Deleted <span className="font-medium">{eventName(lastDeleted.event)}</span>
          </Toast>
        )}
        {change && (
          <Toast key={idOf(change)} tone="success" autoClose onClose={closeChange}
            actions={<Button size="sm" variant="outline" onClick={() => void undo()}><Undo2 aria-hidden="true" /> Undo</Button>}>
            <span className="font-medium">{change.label}</span>
            {/* The first effect only, so it stays within two lines; "Recent changes" keeps the rest. */}
            {change.summary.length > 0 && <span className="text-muted-foreground"> · {change.summary[0]}</span>}
          </Toast>
        )}
      </div>
    </div>,
    document.body,
  );
}
