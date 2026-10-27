// "Tell me what to change": a plain-language revision. The AI turns the words into changes,
// the engine works out the new plan, and nothing is applied until the organiser confirms.

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ChangeDialog } from "@/components/change-dialog";
import { AiBadge, AiNote, FieldError } from "@/components/common";
import { api } from "@/lib/api";
import { addDays, formatShortDate } from "@/lib/format";
import type { PlanRequest, UnderstandResponse } from "@/lib/types";
import { cn } from "@/lib/utils";
import { usePlan } from "@/state/planner";

const show = (value: unknown) =>
  value === null || value === undefined || value === "" ? "not set" : Array.isArray(value) ? value.join(", ") || "none" : String(value);

/** `tone="band"`: white on the Overview's coloured band. */
export function CommandBar({ tone }: { tone?: "band" }) {
  const { inputs, aiAvailable } = usePlan();
  const [text, setText] = useState("");
  const [asked, setAsked] = useState("");
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<UnderstandResponse | null>(null);
  const field = useRef<HTMLInputElement>(null);

  // "/" jumps to the command bar from anywhere except a text field.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.key !== "/" || target.closest("input, textarea, select, [contenteditable=true]")) return;
      event.preventDefault();
      field.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!text.trim()) return;
    setAsked(text.trim());
    setResult(null);
    setOpen(true);
  };

  const load = async () => {
    const response = await api.understand(asked, inputs);
    setResult(response);
    if (!response.plan || !response.changes) return null;
    return { inputs: response.inputs as PlanRequest, plan: response.plan, changes: response.changes };
  };

  const unavailable = !aiAvailable;
  const band = tone === "band";
  // An example that is never already true: a week after the current date.
  const example = inputs ? `move the date to ${formatShortDate(addDays(inputs.event_date, 7))}` : "add 10 guests";

  return (
    <>
      <form onSubmit={submit} role="search" className="relative w-full">
        <label htmlFor="command" className="sr-only">Tell me what to change</label>
        <span
          className={cn(
            "pointer-events-none absolute top-1/2 left-2 grid size-7 -translate-y-1/2 place-items-center rounded-full",
            band ? "bg-primary-foreground/15 text-primary-foreground" : "bg-ai-tint text-ai",
          )}
          aria-hidden="true"
        >
          <Sparkles className="size-3.5" />
        </span>
        <Input
          ref={field} id="command" value={text} onChange={(e) => setText(e.target.value)} maxLength={500}
          disabled={unavailable}
          placeholder={unavailable ? "Changes in your own words need the AI, which isn't set up here" : `Ask Higgins to change anything, e.g. “${example}”`}
          className={cn(
            "h-11 rounded-full pr-16 pl-11",
            band
              ? "border-primary-foreground/30 bg-primary-foreground/10 text-primary-foreground placeholder:text-primary-foreground/88 focus-visible:border-primary-foreground/70 focus-visible:ring-primary-foreground/35"
              : "border-transparent bg-surface shadow-card",
          )}
          aria-describedby="command-hint"
        />
        <span id="command-hint" className="sr-only">Press slash to jump here. You'll see the changes before anything is applied.</span>
        <kbd
          className={cn(
            "pointer-events-none absolute top-1/2 right-10 hidden -translate-y-1/2 rounded border px-1.5 text-xs md:block",
            band ? "border-primary-foreground/30 text-primary-foreground/88" : "bg-card text-muted-foreground",
          )}
          aria-hidden="true"
        >
          /
        </kbd>
        <button type="submit" disabled={unavailable || !text.trim()} aria-label="Preview this change"
          className={cn(
            "absolute top-1/2 right-2 -translate-y-1/2 rounded-full p-1.5 disabled:opacity-40",
            band ? "text-primary-foreground hover:bg-primary-foreground/15" : "text-ai hover:bg-ai-tint",
          )}>
          <ArrowRight className="size-4" aria-hidden="true" />
        </button>
      </form>

      <ChangeDialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o && result?.plan) setText("");
        }}
        title="Here's what I understood"
        description={<>You asked: “{asked}”</>}
        label={`“${asked}”`}
        load={load}
        confirmLabel="Apply this change"
      >
        {result && (
          <div className="space-y-2 rounded-lg border border-ai-border bg-ai-soft p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <AiBadge>AI read this as</AiBadge>
              <AiNote />
            </div>
            {!result.ai_available && <p>Changes in your own words need the AI, which isn't set up here. The quick actions and Edit event details do the same job.</p>}
            {result.ai_available && !result.understood && (
              <p>I couldn't find a change in that. Something like “add 40 guests”, “budget 30 lakh” or “move it to 5 Jan” works well.</p>
            )}
            {result.fields.length > 0 && (
              <ul className="space-y-1">
                {result.fields.map((f) => (
                  <li key={f.field}>
                    <span className="font-medium capitalize">{f.label}:</span> {show(f.before)} → <span className="font-semibold">{show(f.after)}</span>
                  </li>
                ))}
              </ul>
            )}
            {result.unclear.map((u) => <p key={u} className="text-muted-foreground">Not sure: {u}</p>)}
            {result.errors.map((e) => <FieldError key={e.field + e.message}>{e.message}</FieldError>)}
          </div>
        )}
      </ChangeDialog>
    </>
  );
}
