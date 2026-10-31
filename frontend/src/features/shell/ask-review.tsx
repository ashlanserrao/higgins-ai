// The Ask Higgins review card, above the bar: what the organiser's words would change, or why
// there's nothing to apply. The dock decides when it shows; this only lays out the answer.

import { useState, type ReactNode, type Ref } from "react";
import { AlertTriangle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/field-error";
import type { UnderstandResponse } from "@/lib/types";
import { cn } from "@/lib/utils";
import { reviewRows } from "./ask-words";

// Rows the review card shows before "Show n more".
const ROWS_SHOWN = 5;

/** What came back for the words sent: the API's answer, or a failed call. */
export type Outcome = { asked: string } & ({ response: UnderstandResponse; failed?: never } | { failed: true; response?: never });

/** The card above the bar: what the words would change, or why there's nothing to apply. */
export function Review({ outcome, title, ready, headingRef, headingId, onApply, onCancel, onRetry }: {
  outcome: Outcome; title: string; ready: boolean;
  headingRef: Ref<HTMLHeadingElement>; headingId: string;
  onApply: () => void; onCancel: () => void; onRetry: () => void;
}) {
  const [all, setAll] = useState(false);
  const heading = (children: ReactNode, serif = false) => (
    <h2 ref={headingRef} id={headingId} tabIndex={-1} className={cn("outline-none focus-visible:shadow-none", serif ? "font-display text-xl leading-snug" : "text-sm font-semibold")}>
      {children}
    </h2>
  );
  const asked = <p className="mt-1 text-xs text-muted-foreground">You asked: “{outcome.asked}”</p>;
  const cancel = (label = "Cancel") => <Button variant="ghost" size="sm" onClick={onCancel}>{label}</Button>;

  if (outcome.failed) {
    return (
      <>
        {heading("That didn't work. Your plan hasn't changed. Try again?")}
        <div className="mt-3 flex gap-2"><Button variant="outline" size="sm" onClick={onRetry}>Retry</Button>{cancel()}</div>
      </>
    );
  }

  const { response } = outcome;
  if (!ready) {
    const nothing = response.understood && !response.fields.length && !response.errors.length;
    return (
      <>
        {heading(
          !response.ai_available ? "The AI isn't set up here"
            : nothing ? "That's already how it is."
              : !response.understood ? "I couldn't find a change in that"
                : title || "I can't make that change",
        )}
        {asked}
        <div className="mt-2 space-y-1.5 text-[13px]">
          {!response.ai_available && <p>Changes in your own words need it. Edit event details does the same job.</p>}
          {response.ai_available && !response.understood && (
            <p>Something like “add 40 guests”, “budget 30 lakh” or “move it to 5 Jan” works well.</p>
          )}
          {response.unclear.map((note) => <p key={note} className="text-muted-foreground">Not sure: {note}</p>)}
          {response.errors.map((e) => <FieldError key={e.field + e.message}>{e.message}</FieldError>)}
        </div>
        <div className="mt-3">{cancel(nothing ? "OK" : "Change my words")}</div>
      </>
    );
  }

  const rows = reviewRows(response);
  const shown = all ? rows : rows.slice(0, ROWS_SHOWN);
  const notes = [...(response.changes?.warnings_added ?? []), ...response.unclear.map((note) => `Not sure: ${note}`)];
  return (
    <>
      <p className="flex items-center gap-1.5 text-xs font-medium text-ai">
        <Sparkles className="size-3.5" aria-hidden="true" /> I understood
      </p>
      {heading(title, true)}
      {asked}
      <dl className="mt-3 divide-y text-[13px]">
        {shown.map((row) => (
          <div key={row.key} className="flex flex-wrap items-baseline justify-between gap-x-4 py-1.5">
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd className="num font-medium">
              <span className="text-muted-foreground">{row.before}</span>
              <span aria-hidden="true" className="px-1.5 text-muted-foreground">→</span>
              <span className="sr-only"> becomes </span>
              {row.after}
            </dd>
          </div>
        ))}
      </dl>
      {rows.length > ROWS_SHOWN && (
        <button type="button" onClick={() => setAll(!all)} aria-expanded={all} className="mt-1 text-xs font-medium text-primary-text underline-offset-4 hover:underline pointer-coarse:min-h-11">
          {all ? "Show fewer" : `Show ${rows.length - ROWS_SHOWN} more`}
        </button>
      )}
      {notes.length > 0 && (
        <ul className="mt-3 space-y-1.5 text-[13px]">
          {notes.map((note) => (
            <li key={note} className="flex items-start gap-2 text-warning">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" /> <span>{note}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1">
        <Button size="sm" className="rounded-full px-4" onClick={onApply}>Apply change</Button>
        {cancel()}
        <span className="ml-auto text-xs text-muted-foreground">You can undo after</span>
      </div>
    </>
  );
}
