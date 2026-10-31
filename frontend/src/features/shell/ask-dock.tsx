// Ask Higgins: a change to the plan in the organiser's own words, typed or spoken. A circle at
// the bottom right of the content opens into a bar (a sheet on phones). The AI turns the words
// into changes, the engine works out the new plan, and a review card shows exactly what moves;
// nothing is applied until the organiser says so, and the toast after it offers Undo.

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { ArrowUp, Loader2, Mic, X } from "lucide-react";
import { LogoMark } from "@/components/brand";
import { api } from "@/lib/api";
import { readItem, writeItem } from "@/lib/safe-storage";
import type { PlanRequest } from "@/lib/types";
import { useMediaQuery } from "@/lib/use-media-query";
import { speechSupported, useSpeech } from "@/lib/use-speech";
import { cn } from "@/lib/utils";
import { usePlan } from "@/state/planner";
import { usePhoneSheet, useSlashKey } from "./ask-hooks";
import { Review, type Outcome } from "./ask-review";
import { headline, suggestions } from "./ask-words";

const PHONE = "(max-width: 767.98px)";
const OPENED_KEY = "ask:opened";
const draftKey = (eventId: string) => `ask:draft:${eventId}`;

type Stage = "closed" | "open" | "review";

export function AskDock() {
  const { inputs, plan, aiAvailable, activeId, applyChange } = usePlan();
  const phone = useMediaQuery(PHONE);
  const [stage, setStage] = useState<Stage>("closed");
  const [text, setText] = useState(() => (activeId && readItem("session", draftKey(activeId))) || "");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [pulse] = useState(() => !readItem("local", OPENED_KEY));
  const ticket = useRef(0);
  const dock = useRef<HTMLDivElement>(null);
  const circle = useRef<HTMLButtonElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const examples = useRef<HTMLUListElement>(null);
  // The examples show while the cursor is in the empty field (or on an example), until Esc.
  const [focusHere, setFocusHere] = useState(false);
  const [examplesHidden, setExamplesHidden] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const fieldId = useId();
  const hintId = useId();
  const headingId = useId();
  const open = stage !== "closed";

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
    ticket.current++;
    setBusy(false);
    setOutcome(null);
    setStage("closed");
    if (refocus) window.requestAnimationFrame(() => circle.current?.focus());
  }, [stopListening]);

  const backToField = () => {
    setOutcome(null);
    setStage("open");
    window.requestAnimationFrame(() => field.current?.focus());
  };

  const send = async (message: string) => {
    const asked = message.trim();
    if (!asked || busy || !aiAvailable) return;
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
        setStage("review");
      }
    }
  };

  const response = outcome?.response;
  const ready = response?.plan && response.changes && response.fields.length > 0 && !response.errors.length ? response : null;
  const title = response ? headline(response.fields, inputs) : "";

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

  const onFieldKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (showExamples && event.key === "ArrowUp") {
      event.preventDefault();
      exampleButtons().at(-1)?.focus();
    } else if (showExamples && event.key === "Escape") {
      event.preventDefault();
      setExamplesHidden(true);
    } else if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send(text);
    }
  };

  const message = aiAvailable ? speech.message : null;
  const chips = open && stage === "open" && aiAvailable && !text.trim() && !speech.listening && !busy
    ? suggestions(inputs, plan.rebalance?.over_budget_inr ?? 0) : [];
  const showExamples = chips.length > 0 && focusHere && !examplesHidden;

  const inExamples = (node: EventTarget | null) => node instanceof Node && (node === field.current || Boolean(examples.current?.contains(node)));
  const exampleButtons = () => [...(examples.current?.querySelectorAll("button") ?? [])];
  const pick = (example: string) => {
    setText(example);
    void send(example);
  };
  // Up and down move through the examples; down from the last goes back to the field.
  const onExampleKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    const buttons = exampleButtons();
    const at = buttons.indexOf(event.currentTarget);
    if (event.key === "ArrowUp") buttons[Math.max(0, at - 1)].focus();
    else if (event.key === "ArrowDown") (buttons[at + 1] ?? field.current)?.focus();
    else if (event.key === "Escape") {
      setExamplesHidden(true);
      field.current?.focus();
    } else return;
    event.preventDefault();
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

      {/* Examples to try: a menu that drops up from the bar while its field is empty and has
          the cursor. Pressing on one keeps the cursor in the field (no blur), then sends it. */}
      {showExamples && (
        <ul
          ref={examples} aria-label="Examples to try"
          onBlur={(e) => !inExamples(e.relatedTarget) && setFocusHere(false)}
          className="pointer-events-auto mb-2 min-w-56 rounded-xl border bg-popover p-1.5 max-md:w-full [[data-theme=dark]_&]:border-(--hairline-strong)"
        >
          {chips.map(({ icon: Icon, text: example }) => (
            <li key={example}>
              <button
                type="button" tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(example)} onKeyDown={onExampleKey}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] outline-none hover:bg-accent focus-visible:bg-accent pointer-coarse:min-h-11"
              >
                <Icon className="size-3.5 shrink-0 text-primary-text" aria-hidden="true" /> {example}
              </button>
            </li>
          ))}
        </ul>
      )}

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
                onFocus={(e) => {
                  setFocusHere(true);
                  if (!inExamples(e.relatedTarget)) setExamplesHidden(false);
                }}
                onBlur={(e) => !inExamples(e.relatedTarget) && setFocusHere(false)}
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

// Each bar's height and its place in the wave.
const BARS = [
  "h-3", "h-[19px] [animation-delay:-150ms]", "h-6 [animation-delay:-300ms]", "h-4 [animation-delay:-450ms]",
  "h-[22px] [animation-delay:-600ms]", "h-[13px] [animation-delay:-750ms]", "h-2 [animation-delay:-100ms]",
];

/** Seven bars that rise and fall while the browser listens; still under reduced motion. */
function Waveform() {
  return (
    <span className="flex h-6 shrink-0 items-center gap-[3px]" aria-hidden="true">
      {BARS.map((bar) => (
        <span key={bar} className={cn("w-[3px] rounded-full bg-primary-text motion-safe:animate-[ask-wave_900ms_ease-in-out_infinite]", bar)} />
      ))}
    </span>
  );
}
