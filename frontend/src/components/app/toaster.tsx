// Floating confirmations: a change applied (with Undo), an event deleted (with Undo), and
// failures. They drop in at the top centre of the window, in a fixed layer, so they never move
// the page. Success toasts rise away after 4 seconds (held while hovered or focused); failures
// stay until closed. One of each kind at a time, so at most three. Ctrl/Cmd+Z undoes the newest
// while it shows.
// Changes the engine makes on its own (a quote under its estimate) never toast: they stay in the
// note under the budget bar and in "Recent changes".

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, CheckCircle2, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { eventName } from "@/lib/format";
import { cn } from "@/lib/utils";
import { usePlanner, type LastChange } from "@/state/planner";

const SHOW_MS = 4000;
const MOVE_MS = 280; // the drop in and the rise away

// Slim controls keep a 44px touch area: the hit area reaches past the visible button.
const HIT = "relative before:absolute before:-inset-2 before:content-['']";

/** One toast. `onClose` runs once its exit animation has played. */
function Toast({ tone, autoClose, onClose, children, actions }: {
  tone: "success" | "danger"; autoClose: boolean; onClose: () => void; children: ReactNode; actions?: ReactNode;
}) {
  const [leaving, setLeaving] = useState(false);
  const [held, setHeld] = useState(false);
  const remaining = useRef(SHOW_MS);
  const close = useCallback(() => {
    setLeaving(true);
    window.setTimeout(onClose, MOVE_MS);
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
    // biome-ignore lint/a11y/noStaticElementInteractions: hovering or focusing a toast only pauses its timer.
    <div
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setHeld(false)}
      className={cn(
        "pointer-events-auto flex max-w-[min(480px,100%)] items-center gap-2.5 rounded-2xl border bg-popover py-1.5 pr-1.5 pl-3 text-[13px] leading-[18px] duration-280 ease-out",
        // Dark lifts by a lighter surface, not a heavier shadow, so it stands off the dark card.
        "[[data-theme=dark]_&]:border-(--hairline-strong) [[data-theme=dark]_&]:bg-surface-soft",
        // From above the top edge to just below it, and back up the same way.
        leaving
          ? "animate-out fade-out-0 slide-out-to-top-[calc(100%+1rem)] fill-mode-forwards"
          : "animate-in fade-in-0 slide-in-from-top-[calc(100%+1rem)]",
      )}
    >
      {tone === "success"
        ? <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden="true" />
        : <AlertCircle className="size-4 shrink-0 text-danger" aria-hidden="true" />}
      <p className="line-clamp-2 min-w-0 flex-1">
        <span className="sr-only">{tone === "success" ? "Done: " : "Couldn't do that: "}</span>
        {children}
      </p>
      <div className="flex shrink-0 items-center gap-0.5">
        {actions}
        <Button size="icon-xs" variant="ghost" onClick={close} aria-label="Close" className={cn("size-7 rounded-full", HIT)}>
          <X className="size-3.5" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

// Undo is a Tab-trip away (the toast sits outside the page's flow) and the toast leaves after 4
// seconds, so the shortcut is announced with the toast and named on the button.
const UndoButton = ({ onClick }: { onClick: () => void }) => (
  <Button
    size="xs" variant="outline" onClick={onClick} aria-keyshortcuts="Control+Z Meta+Z" title="Undo (Ctrl+Z)"
    className={cn("h-7 gap-1 rounded-full px-2.5 text-[13px]", HIT)}
  >
    <Undo2 aria-hidden="true" /> Undo
  </Button>
);
const UndoHint = () => <span className="sr-only"> Ctrl+Z to undo.</span>;

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
        "pointer-events-none fixed inset-x-0 z-40 flex flex-col items-center px-(--page-gutter)",
        // At the top of the screen, clear of a notch, centred on the whole window.
        "top-[calc(env(safe-area-inset-top)+0.75rem)]",
      )}
    >
      {/* Both regions are always mounted, so screen readers hear each toast as it arrives. */}
      <div role="alert" className={cn("flex w-full flex-col items-center", failure && (lastDeleted || change) && "mb-2")}>
        {failure && <Toast key={failure.id} tone="danger" autoClose={false} onClose={dismissFailure}>{failure.text}</Toast>}
      </div>
      <div role="status" aria-live="polite" className="flex w-full flex-col items-center gap-2">
        {lastDeleted && (
          <Toast key={idOf(lastDeleted)} tone="success" autoClose onClose={dismissDeleted}
            actions={<UndoButton onClick={undoDelete} />}>
            Deleted <span className="font-medium">{eventName(lastDeleted.event)}</span><UndoHint />
          </Toast>
        )}
        {change && (
          <Toast key={idOf(change)} tone="success" autoClose onClose={closeChange}
            actions={<UndoButton onClick={() => void undo()} />}>
            <span className="font-medium">{change.label}</span>
            {/* The first effect only, so it stays within two lines; "Recent changes" keeps the rest. */}
            {change.summary.length > 0 && <span className="text-muted-foreground"> · {change.summary[0]}</span>}
            <UndoHint />
          </Toast>
        )}
      </div>
    </div>,
    document.body,
  );
}
