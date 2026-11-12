// The Ask Higgins review card, above the bar: what the agent proposes (before → after rows and
// any vendor messages it drafted), or why there's nothing to apply. The dock decides when it
// shows; this only lays out the answer. The headline is ours, built from what changes; the
// model's own sentence is the quieter line under it.

import { useState, type ReactNode, type Ref } from "react";
import { AlertTriangle, Check, Copy, Mail, MessageCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AskResponse, DraftedVendorMessage } from "@/lib/api/types";
import { MESSAGE_KINDS } from "@/lib/tasks";
import { cn } from "@/lib/utils";
import { usePlan } from "@/state/planner";
import { reviewRows } from "./ask-words";

// Rows the review card shows before "Show n more".
const ROWS_SHOWN = 5;

/** What came back for the words sent: the API's answer, or a failed call (why, and whether
 *  asking again could help). */
export type Outcome = { asked: string } & (
  | { response: AskResponse; failed?: never }
  | { failed: true; error: string; retry: boolean; response?: never }
);

/** The card above the bar: the agent's proposal, or why there's nothing to apply. */
export function Review({ outcome, title, ready, headingRef, headingId, onApply, onCancel, onDone, onRetry }: {
  outcome: Outcome; title: string; ready: boolean;
  headingRef: Ref<HTMLHeadingElement>; headingId: string;
  onApply: () => void; onCancel: () => void; onDone: () => void; onRetry: () => void;
}) {
  const [all, setAll] = useState(false);
  const heading = (children: ReactNode, serif = false) => (
    <h2 ref={headingRef} id={headingId} tabIndex={-1} className={cn("outline-none focus-visible:shadow-none", serif ? "font-display text-xl leading-snug" : "text-sm font-semibold")}>
      {children}
    </h2>
  );
  const asked = <p className="mt-1 text-xs text-muted-foreground">You asked: “{outcome.asked}”</p>;
  const cancel = (label = "Cancel") => <Button variant="ghost" size="sm" onClick={onCancel}>{label}</Button>;
  const retry = <Button variant="outline" size="sm" onClick={onRetry}>Retry</Button>;

  if (outcome.failed) {
    return (
      <>
        {heading(outcome.error)}
        {asked}
        <p className="mt-2 text-[13px] text-muted-foreground">Your plan hasn't changed.</p>
        <div className="mt-3 flex gap-2">{outcome.retry && retry}{cancel(outcome.retry ? "Cancel" : "OK")}</div>
      </>
    );
  }

  const { response } = outcome;
  const notes = [...(response.changes?.warnings_added ?? []), ...response.notes.map((note) => `Not sure: ${note}`)];
  const noteList = notes.length > 0 && (
    <ul className="mt-3 space-y-1.5 text-[13px]">
      {notes.map((note) => (
        <li key={note} className="flex items-start gap-2 text-warning">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" /> <span>{note}</span>
        </li>
      ))}
    </ul>
  );

  // Nothing to apply and nothing drafted: an answer to a question, or the agent gave up.
  if (!ready && !response.messages.length) {
    const answered = response.ai_available && response.stopped === "done";
    return (
      <>
        {heading(!response.ai_available ? "The AI isn't set up here" : response.reply)}
        {asked}
        <div className="mt-2 text-[13px]">
          {!response.ai_available && <p>Changes in your own words need it. Edit event details does the same job.</p>}
          {answered && <p className="text-muted-foreground">Nothing in your plan changes.</p>}
        </div>
        {noteList}
        <div className="mt-3 flex gap-2">
          {response.ai_available && !answered && retry}
          {cancel(answered ? "OK" : "Change my words")}
        </div>
      </>
    );
  }

  const rows = ready ? reviewRows(response) : [];
  const shown = all ? rows : rows.slice(0, ROWS_SHOWN);
  return (
    <>
      {response.partial ? (
        <p className="flex items-center gap-1.5 text-xs font-medium text-warning">
          <AlertTriangle className="size-3.5" aria-hidden="true" /> Part done
        </p>
      ) : (
        <p className="flex items-center gap-1.5 text-xs font-medium text-ai">
          <Sparkles className="size-3.5" aria-hidden="true" /> I understood
        </p>
      )}
      {heading(title, true)}
      {/* The model's sentence (or the server's, when it stopped early): never the source of a number. */}
      <p className={cn("mt-1 text-[13px]", response.partial ? "text-warning" : "text-muted-foreground")}>{response.reply}</p>
      {asked}
      {rows.length > 0 && (
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
      )}
      {rows.length > ROWS_SHOWN && (
        <button type="button" onClick={() => setAll(!all)} aria-expanded={all} className="mt-1 text-xs font-medium text-primary-text underline-offset-4 hover:underline pointer-coarse:min-h-11">
          {all ? "Show fewer" : `Show ${rows.length - ROWS_SHOWN} more`}
        </button>
      )}
      {noteList}
      {response.messages.length > 0 && (
        <>
          {ready && <p className="mt-3 text-xs text-muted-foreground">Messages are written for the plan with these changes.</p>}
          <ul className="mt-2 space-y-2">
            {response.messages.map((message) => <VendorMessage key={message.task_id + message.kind} message={message} />)}
          </ul>
        </>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1">
        {ready ? (
          <>
            <Button size="sm" className="rounded-full px-4" onClick={onApply}>Apply change</Button>
            {cancel()}
            <span className="ml-auto text-xs text-muted-foreground">You can undo after</span>
          </>
        ) : (
          <Button size="sm" className="rounded-full px-4" onClick={onDone}>Done</Button>
        )}
      </div>
    </>
  );
}

/** One drafted message: folded to three lines, with Copy and WhatsApp, as in Message a vendor. */
function VendorMessage({ message }: { message: DraftedVendorMessage }) {
  const { announce } = usePlan();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const kind = MESSAGE_KINDS.find((k) => k.value === message.kind)?.label ?? "Message";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.text);
      setCopied(true);
      announce("Copied. Paste it into WhatsApp or email.");
    } catch {
      announce("Select the text and copy it.");
    }
  };

  return (
    <li className="rounded-xl border p-3">
      <p className="flex items-center gap-1.5 text-[13px] font-medium">
        <Mail className="size-3.5 text-muted-foreground" aria-hidden="true" /> {kind} to the {message.label}
      </p>
      <p className={cn("mt-1.5 whitespace-pre-line text-xs leading-relaxed text-muted-foreground", !open && "line-clamp-3")}>{message.text}</p>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="mt-1 text-xs font-medium text-primary-text underline-offset-4 hover:underline pointer-coarse:min-h-11">
        {open ? "Show less" : "Show all"}
      </button>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={copy}>
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />} {copied ? "Copied" : "Copy"}
        </Button>
        <Button asChild variant="outline" size="sm">
          <a href={`https://wa.me/?text=${encodeURIComponent(message.text)}`} target="_blank" rel="noopener noreferrer">
            <MessageCircle aria-hidden="true" /> Send on WhatsApp
          </a>
        </Button>
      </div>
    </li>
  );
}
