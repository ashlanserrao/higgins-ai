// Ask Higgins: a change to the plan in the organiser's own words, typed or spoken. A circle at
// the bottom right of the content opens into a bar (a sheet on phones). The AI turns the words
// into changes, the engine works out the new plan, and a review card shows exactly what moves;
// nothing is applied until the organiser says so, and the toast after it offers Undo.

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { ArrowUp, Loader2, Mic, X } from "lucide-react";
import { LogoMark } from "@/components/brand";
import { readItem, writeItem } from "@/lib/safe-storage";
import type { PlanRequest } from "@/lib/types";
import { useMediaQuery } from "@/lib/use-media-query";
import { speechSupported, useSpeech } from "@/lib/use-speech";
import { cn } from "@/lib/utils";
import { usePlan } from "@/state/planner";
import { usePhoneSheet, useSlashKey } from "./ask-hooks";
import { ExamplesMenu, Waveform } from "./ask-parts";
import { Review } from "./ask-review";
import { useAskRequest, useExamples } from "./ask-state";
import { suggestions } from "./ask-words";

const PHONE = "(max-width: 767.98px)";
const OPENED_KEY = "ask:opened";
const draftKey = (eventId: string) => `ask:draft:${eventId}`;

type Stage = "closed" | "open" | "review";

export function AskDock() {
  const { inputs, plan, aiAvailable, activeId, applyChange } = usePlan();
  const phone = useMediaQuery(PHONE);
  const [stage, setStage] = useState<Stage>("closed");
  const [text, setText] = useState(() => (activeId && readItem("session", draftKey(activeId))) || "");
  const [pulse] = useState(() => !readItem("local", OPENED_KEY));
  const dock = useRef<HTMLDivElement>(null);
  const circle = useRef<HTMLButtonElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const fieldId = useId();
  const hintId = useId();
  const headingId = useId();
  const open = stage !== "closed";
  const request = useAskRequest(inputs, aiAvailable, () => setStage("review"));
  const { busy, outcome, ready, title, send, drop } = request;

  const heard = useRef(false);
  const speech = useSpeech((words) => {
    setText((before) => (before.trim() ? `${before.trim()} ${words}` : words));
    heard.current = true;
  });
  // What was heard lands in the field, ready to edit or send; it is never sent by itself.
  useEffect(() => {
    if (speech.listening || !heard.current) return;
    heard.current = false;
    field.current?.focus();
  }, [speech.listening]);

  // Unsent words wait for the organiser while this tab is open, per event.
  useEffect(() => {
    if (activeId) writeItem("session", draftKey(activeId), text || null);
  }, [activeId, text]);

  // The field grows with its text, up to three lines, then scrolls. Measured again as the bar
  // widens, since it opens from the circle's width.
  // biome-ignore lint/correctness/useExhaustiveDependencies: text, stage and listening are triggers: each can change the field's height.
  useLayoutEffect(() => {
    const el = field.current;
    if (!el) return;
    const fitHeight = () => {
      el.style.height = "auto";
      el.style.height = el.value ? `${Math.min(el.scrollHeight, 80)}px` : "";
    };
    fitHeight();
    let width = el.offsetWidth;
    const observer = new ResizeObserver(() => {
      if (el.offsetWidth === width) return;
      width = el.offsetWidth;
      fitHeight();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [text, stage, speech.listening]);

  const openDock = useCallback(() => {
    setStage((s) => (s === "closed" ? "open" : s));
    writeItem("local", OPENED_KEY, "1");
    window.requestAnimationFrame(() => field.current?.focus());
  }, []);

  const { abort: stopListening } = speech;
  const close = useCallback((refocus = true) => {
    stopListening();
    drop();
    setStage("closed");
    if (refocus) window.requestAnimationFrame(() => circle.current?.focus());
  }, [stopListening, drop]);

  const backToField = () => {
    request.clear();
    setStage("open");
    window.requestAnimationFrame(() => field.current?.focus());
  };

  const apply = () => {
    if (!ready?.plan || !ready.changes) return;
    applyChange(ready.inputs as PlanRequest, ready.plan, title, ready.changes.summary);
    setText("");
    close();
  };

  // The card is announced by taking focus as it appears.
  // biome-ignore lint/correctness/useExhaustiveDependencies: outcome is a trigger: a retry's new card takes focus too.
  useEffect(() => {
    if (stage === "review") heading.current?.focus();
  }, [stage, outcome]);

  // "/" opens the dock from anywhere except a text field. On a phone the open dock is a sheet.
  useSlashKey(openDock);
  usePhoneSheet(dock, phone && open, close);

  const listen = () => (speech.listening ? speech.stop() : speech.start());

  // Esc steps back one level: listening, then the review card, then the bar.
  const onKeyDown = (event: KeyboardEvent) => {
    // Handled already when Esc only closed the examples.
    if (event.key !== "Escape" || !open || event.defaultPrevented) return;
    event.preventDefault();
    if (speech.listening) speech.stop();
    else if (stage === "review") backToField();
    else close();
  };

  const message = aiAvailable ? speech.message : null;
  const chips = open && stage === "open" && aiAvailable && !text.trim() && !speech.listening && !busy
    ? suggestions(inputs, plan.rebalance?.over_budget_inr ?? 0) : [];
  const examples = useExamples(field, chips.length > 0);

  const onFieldKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (examples.onFieldKey(event)) return;
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send(text);
    }
  };

  const pick = (example: string) => {
    setText(example);
    void send(example);
  };

  return (
    <div
      ref={dock} role="region" aria-label="Ask Higgins" onKeyDown={onKeyDown}
      className={cn(
        "fixed z-40 flex flex-col items-end",
        open && phone
          // A sheet across the foot of a phone, over the bottom navigation.
          ? "inset-x-3 bottom-[calc(12px+env(safe-area-inset-bottom)+var(--ask-kb,0px))] rounded-2xl border bg-popover p-2 [[data-theme=dark]_&]:border-(--hairline-strong)"
          // Bottom right of the content: above the bottom navigation, or beside the sidebar.
          : "pointer-events-none right-4 bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] left-4 lg:right-6 lg:bottom-6 lg:left-[calc(var(--sidebar-w,260px)+24px)]",
      )}
    >
      {stage === "review" && outcome && (
        <section
          aria-labelledby={headingId}
          className={cn(
            "pointer-events-auto mb-2 max-h-[min(60vh,520px)] w-[min(520px,100%)] scroll-area overflow-y-auto rounded-[18px] p-4",
            phone ? "w-full bg-surface-soft" : "border bg-popover [[data-theme=dark]_&]:border-(--hairline-strong)",
          )}
        >
          <Review
            outcome={outcome} title={title} ready={Boolean(ready)} headingRef={heading} headingId={headingId}
            onApply={apply} onCancel={backToField} onRetry={() => void send(outcome.asked)}
          />
        </section>
      )}

      {examples.shown && <ExamplesMenu chips={chips} menu={examples} onPick={pick} />}

      {/* Always mounted, so what it says is read out as it changes. */}
      <div aria-live="polite" className="contents">
        {message && (
          <p className="pointer-events-auto mb-2 w-[min(520px,100%)] rounded-xl border bg-popover px-3 py-2 text-[13px] text-muted-foreground max-md:w-full">
            {message}
          </p>
        )}
        {busy && <span className="sr-only">Working it out…</span>}
      </div>

      <div
        className={cn(
          "pointer-events-auto relative flex min-h-[52px] items-end overflow-hidden rounded-[26px] border",
          // One ring round the whole bar when its field or circle has focus, as the app's rings look.
          "outline-offset-2 outline-ring has-[[data-circle]:focus-visible]:outline-2 has-[textarea:focus-visible]:outline-2",
          "bg-popover",
          // Grows leftwards from the circle: the right edge stays put.
          open ? (phone ? "w-full" : "w-[min(520px,100%)]") : "w-[52px]",
          !phone && "transition-[width,background-color] duration-280 ease-[cubic-bezier(0.16,1,0.3,1)]",
          !(open && phone) && "[[data-theme=dark]_&]:border-(--hairline-strong)",
          // The one shadow in the app: the circle floats over whatever page is under it.
          !open && "shadow-float",
          pulse && !open && "motion-safe:animate-[ask-pulse_1.6s_ease-out_600ms_2]",
        )}
      >
        {open && (
          <div className="flex min-w-0 flex-1 items-end gap-1 py-[6px] pl-4 pointer-coarse:py-[3px]">
            <label htmlFor={fieldId} className="sr-only">Ask Higgins to change anything</label>
            {speech.listening ? (
              <div className="flex min-h-[38px] min-w-0 flex-1 items-center gap-2.5 pointer-coarse:min-h-11">
                <Waveform />
                <p className={cn("min-w-0 flex-1 truncate text-sm", !speech.transcript && "text-muted-foreground")} aria-live="polite">
                  {speech.transcript || "Listening…"}
                </p>
              </div>
            ) : (
              <textarea
                ref={field} id={fieldId} rows={1} value={text} maxLength={500} disabled={!aiAvailable}
                onChange={(e) => {
                  setText(e.target.value);
                  speech.clearError();
                }}
                onKeyDown={onFieldKey}
                onFocus={examples.onFieldFocus}
                onBlur={examples.onBlur}
                aria-describedby={hintId}
                placeholder={!aiAvailable ? "Changes in your own words need the AI, which isn't set up here"
                  // The phone's 16px text (smaller makes iOS zoom in) fits only the short one.
                  : phone ? "Ask for a change…" : "Ask Higgins to change anything…"}
                className="min-h-[38px] min-w-0 flex-1 scroll-area resize-none bg-transparent py-[9px] text-base leading-5 outline-none placeholder:text-muted-foreground placeholder-shown:overflow-hidden placeholder-shown:text-ellipsis placeholder-shown:whitespace-nowrap focus-visible:shadow-none disabled:cursor-not-allowed md:text-sm pointer-coarse:min-h-11 pointer-coarse:py-3"
              />
            )}
            <span id={hintId} className="sr-only">Press Enter to see the change before anything is applied. Shift+Enter starts a new line. With the field empty, Up arrow goes to examples.</span>
            {speechSupported && aiAvailable && (
              <button
                type="button" onClick={listen} aria-pressed={speech.listening} aria-label="Speak your change" title="Speak your change"
                className={cn(
                  "grid size-[38px] shrink-0 place-items-center rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 pointer-coarse:size-11",
                  speech.listening
                    ? "bg-primary text-primary-foreground motion-safe:animate-[ask-listen_1.4s_ease-out_infinite]"
                    : "text-muted-foreground hover:bg-surface-soft hover:text-foreground",
                )}
              >
                <Mic className="size-[18px]" aria-hidden="true" />
              </button>
            )}
            <button
              type="button" onClick={() => void send(text)} disabled={!text.trim() || busy || !aiAvailable || speech.listening}
              aria-label="See this change" title="See this change (Enter)" aria-busy={busy}
              className="grid size-[38px] shrink-0 place-items-center rounded-full bg-foreground text-surface outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-40 pointer-coarse:size-11"
            >
              {busy ? <Loader2 className="size-[18px] animate-spin" aria-hidden="true" /> : <ArrowUp className="size-[18px]" aria-hidden="true" />}
            </button>
          </div>
        )}
        <button
          ref={circle} type="button" data-circle
          onClick={() => (open ? close() : openDock())}
          aria-expanded={open} aria-controls={fieldId} aria-keyshortcuts="/"
          aria-label={open ? "Close Ask Higgins" : "Ask Higgins"} title={open ? "Close (Esc)" : "Ask Higgins (press /)"}
          className={cn(
            "relative grid size-[50px] shrink-0 place-items-center rounded-full outline-none focus-visible:shadow-none",
            open ? "text-muted-foreground hover:text-foreground" : "text-primary-ink",
          )}
        >
          <LogoMark className={cn("absolute size-[30px] transition-opacity duration-120", open && "opacity-0")} />
          <X className={cn("absolute size-5 transition-opacity duration-120", !open && "opacity-0")} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
