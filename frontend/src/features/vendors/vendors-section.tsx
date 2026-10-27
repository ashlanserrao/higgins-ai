// Vendors: paste or type quotes, compare them like for like, accept one per category,
// and message vendors.

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  BadgeCheck, ClipboardPaste, FileText, Loader2, MessageSquareText, PencilLine, ReceiptIndianRupee, Sparkles, Trash2, Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AiBadge, EmptyState, Panel, StatusBadge } from "@/components/common";
import { PageBand } from "@/features/shell/page-band";
import { MessageDialog } from "@/components/message-dialog";
import { api } from "@/lib/api";
import { formatDate, inr, plural } from "@/lib/format";
import { canMessage, lineTask, taskShortName } from "@/lib/tasks";
import type { Quote, QuoteComparison } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useNav } from "@/state/nav";
import { usePlan } from "@/state/planner";
import { RebalanceNote } from "@/features/budget/budget-section";
import { blankQuote, newQuoteId, QuoteEditor } from "./quote-editor";

const CAPACITY = {
  fits: { tone: "success", label: "Covers your guests" },
  too_small: { tone: "danger", label: "Too small" },
  not_stated: { tone: "neutral", label: "Guests not stated" },
} as const;

function PasteQuote({ onDraft, onManual }: { onDraft: (quote: Quote) => void; onManual: () => void }) {
  const { inputs, aiAvailable } = usePlan();
  const { consumeIntent } = useNav();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const field = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (consumeIntent("add-quote")) field.current?.focus();
  }, [consumeIntent]);

  const read = async (event: FormEvent) => {
    event.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    setNote("");
    try {
      const { quote, ai_available } = await api.extractQuote(inputs, text);
      if (!ai_available) setNote("Reading quotes needs the AI, which isn't set up here. Typing it in works just as well.");
      else if (!quote) setNote("I couldn't find a price, guest count or what's included in that. You can type the quote in instead.");
      else {
        onDraft({ ...quote, category: quote.category ?? "", id: newQuoteId(), source: "ai_extracted", verified: false, accepted_on: null });
        setText("");
      }
    } catch (error) {
      setNote((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="Add a quote" icon={ClipboardPaste} tone="ai" description="Paste the vendor's WhatsApp message, email or PDF text. AI copies the details, then you give them a quick check."
      actions={<AiBadge />}>
      <form onSubmit={read} className="space-y-2">
        <Label htmlFor="quote-text" className="sr-only">Quote text</Label>
        <Textarea
          ref={field} id="quote-text" rows={5} maxLength={3000} value={text} onChange={(e) => setText(e.target.value)} className="bg-card"
          placeholder="e.g. Shree Caterers: ₹2,200 per plate veg for 300 guests, includes service staff and crockery, GST extra, valid till 30 Nov"
          disabled={!aiAvailable} aria-describedby="quote-note"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="num text-xs text-muted-foreground">{text.length} / 3,000</span>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onManual}><PencilLine aria-hidden="true" /> Type it in</Button>
            <Button type="submit" disabled={!aiAvailable || busy || !text.trim()} aria-busy={busy}>
              {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Sparkles aria-hidden="true" />}
              {busy ? "Reading…" : "Read the quote"}
            </Button>
          </div>
        </div>
        <p id="quote-note" aria-live="polite" className="text-sm text-muted-foreground">
          {aiAvailable ? note : "Reading quotes needs the AI, which isn't set up here. Typing them in works just as well."}
        </p>
      </form>
    </Panel>
  );
}

function QuoteCard({ quote, comparison, onEdit }: { quote: Quote; comparison: QuoteComparison; onEdit: () => void }) {
  const { plan, inputs, updateProgress } = usePlan();
  const [error, setError] = useState("");
  const priced = comparison.total_inr !== null;
  const name = quote.vendor || "Unnamed vendor";
  const capacity = CAPACITY[comparison.capacity];

  const run = (change: (quotes: Quote[]) => Quote[], label: string) => {
    setError("");
    updateProgress((p) => ({ ...p, quotes: change(p.quotes) }), label).catch((e) => setError((e as Error).message));
  };
  const accept = () =>
    run((quotes) => quotes.map((q) => (q.category === quote.category ? { ...q, accepted_on: q.id === quote.id ? plan.today : null } : q)),
      `Accepted ${name}'s quote`);
  const unaccept = () => run((quotes) => quotes.map((q) => (q.id === quote.id ? { ...q, accepted_on: null } : q)), `Un-accepted ${name}'s quote`);
  const remove = () => run((quotes) => quotes.filter((q) => q.id !== quote.id), `Deleted ${name}'s quote`);

  return (
    <article className={cn("flex flex-col rounded-xl bg-card p-5 shadow-card transition-[box-shadow,transform] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-raised", comparison.accepted && "ring-2 ring-success")} aria-label={`Quote from ${name}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          {comparison.accepted && <StatusBadge tone="success" icon={BadgeCheck} className="mb-1.5">Accepted · Confirmed</StatusBadge>}
          <h4 className="font-display text-lg">{name}</h4>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {quote.source === "ai_extracted" ? <AiBadge>Read by AI</AiBadge> : <StatusBadge tone="neutral" icon={FileText}>Typed in</StatusBadge>}
            {quote.verified ? <StatusBadge tone="success">Checked</StatusBadge> : <StatusBadge tone="warning">Needs your check</StatusBadge>}
            {comparison.expired && <StatusBadge tone="danger">Expired</StatusBadge>}
          </div>
        </div>
        <div className="text-right">
          <p className="num font-display text-2xl">{priced ? inr(comparison.total_inr!) : "No price yet"}</p>
          {comparison.calculated && quote.per_plate_inr !== null && (
            <p className="num text-xs text-muted-foreground">{inr(quote.per_plate_inr)}/plate × {inputs.guests} guests</p>
          )}
        </div>
      </div>

      <dl className="num mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 border-t pt-3 text-sm">
        <dt className="text-muted-foreground">Per guest</dt>
        <dd className="text-right">{comparison.per_guest_inr !== null ? inr(comparison.per_guest_inr) : "—"}</dd>
        <dt className="text-muted-foreground">Capacity</dt>
        <dd className="text-right"><StatusBadge tone={capacity.tone}>{capacity.label}{quote.guests_covered ? ` (${quote.guests_covered})` : ""}</StatusBadge></dd>
        <dt className="text-muted-foreground">Against estimate</dt>
        <dd className={cn("text-right font-medium", (comparison.vs_estimate_inr ?? 0) > 0 ? "text-danger" : "text-success")}>
          {comparison.vs_estimate_inr === null ? "—" : comparison.vs_estimate_inr > 0 ? `${inr(comparison.vs_estimate_inr)} over` : `${inr(-comparison.vs_estimate_inr)} under`}
        </dd>
        <dt className="text-muted-foreground">Taxes</dt>
        <dd className="text-right">{quote.taxes_included === null ? "Not stated" : quote.taxes_included ? "Included" : "Extra"}</dd>
        {quote.valid_until && (
          <>
            <dt className="text-muted-foreground">Valid until</dt>
            <dd className="text-right">{formatDate(quote.valid_until)}</dd>
          </>
        )}
      </dl>
      {(quote.inclusions.length > 0 || quote.exclusions.length > 0) && (
        <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
          {quote.inclusions.length > 0 && (
            <div><p className="font-medium">Included</p><ul className="mt-0.5 list-disc pl-4 text-muted-foreground">{quote.inclusions.map((i) => <li key={i}>{i}</li>)}</ul></div>
          )}
          {quote.exclusions.length > 0 && (
            <div><p className="font-medium">Not included</p><ul className="mt-0.5 list-disc pl-4 text-muted-foreground">{quote.exclusions.map((i) => <li key={i}>{i}</li>)}</ul></div>
          )}
        </div>
      )}
      {comparison.missing.length > 0 && (
        <p className="mt-3 text-xs"><span className="font-medium text-warning">Worth asking:</span> {comparison.missing.join(", ")}</p>
      )}

      <div className="no-print mt-auto flex flex-wrap gap-2 border-t pt-3">
        {comparison.accepted ? (
          <Button size="sm" variant="outline" onClick={unaccept}><Undo2 aria-hidden="true" /> Un-accept</Button>
        ) : (
          <Button size="sm" variant="outline" onClick={accept} disabled={!quote.verified || !priced}
            aria-describedby={!quote.verified || !priced ? `why-${quote.id}` : undefined}>
            <BadgeCheck aria-hidden="true" /> Accept this quote
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={onEdit}>{quote.verified ? <PencilLine aria-hidden="true" /> : <BadgeCheck aria-hidden="true" />} {quote.verified ? "Edit" : "Check details"}</Button>
        <Button size="icon-sm" variant="ghost" onClick={remove} aria-label={`Delete the quote from ${name}`} className="ml-auto"><Trash2 aria-hidden="true" /></Button>
      </div>
      {!comparison.accepted && (!quote.verified || !priced) && (
        <p id={`why-${quote.id}`} className="mt-2 text-xs text-muted-foreground">
          {!priced ? "Add a price first, then you can accept it." : "Give the details a quick check first, then you can accept it."}
        </p>
      )}
      {error && <p className="mt-2 text-xs font-medium text-danger">{error}</p>}
    </article>
  );
}

export function VendorsSection() {
  const { plan, inputs } = usePlan();
  const [editing, setEditing] = useState<Quote | null>(null);
  const [messageFor, setMessageFor] = useState<string | null>(null);
  const [messageOpen, setMessageOpen] = useState(false);
  const quotes = new Map(inputs.progress.quotes.map((q) => [q.id, q]));
  const categories = plan.budget_lines.filter((l) => plan.quote_comparisons[l.key]?.length);
  const ignored = inputs.progress.quotes.filter((q) => plan.ignored_quotes.includes(q.id));
  const messageable = plan.checklist.filter((i) => canMessage(i.id));
  const first = plan.checklist.find((i) => !i.done && canMessage(i.id));
  const firstUp = first && taskShortName(first.label);

  return (
    <div className="space-y-6">
      <PageBand
        eyebrow={`${plural(inputs.progress.quotes.length, "quote")} · ${plan.budget_lines.filter((l) => l.source === "confirmed").length} confirmed`}
        title="Vendors"
        description="See quotes side by side: total, cost per guest and what's missing. Accept one per category and your budget adjusts around it."
      />
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <PasteQuote onDraft={setEditing} onManual={() => setEditing(blankQuote())} />
        <Panel title="Message vendors" icon={MessageSquareText} description="Ready-to-send enquiries, follow-ups and confirmations, written from your plan.">
          <ul className="space-y-1">
            {messageable.slice(0, 8).map((item) => (
              <li key={item.id}>
                <button onClick={() => { setMessageFor(item.id); setMessageOpen(true); }}
                  className="flex w-full items-center justify-between gap-2 rounded-[10px] px-3 py-2 text-left text-sm hover:bg-surface-soft">
                  <span>{item.label}</span>
                  <MessageSquareText className="size-4 text-muted-foreground" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <RebalanceNote />

      {categories.length === 0 && (
        <EmptyState icon={ReceiptIndianRupee} title="No quotes saved yet">
          Start with the one that fills up first{firstUp ? <>: your {firstUp}</> : ""}. Send an enquiry from "Message vendors" so replies cover the same points.
        </EmptyState>
      )}

      {categories.map((line) => {
        const task = lineTask(inputs.event_type, line.key);
        return (
          <Panel key={line.key} title={line.label}
            description={<span className="num">Estimate {inr(line.estimate_inr)} · now {inr(line.amount_inr)} {line.source === "confirmed" ? "confirmed" : "planned"}</span>}
            actions={
              <>
                <Button size="sm" variant="outline" onClick={() => setEditing(blankQuote(line.key))}><PencilLine aria-hidden="true" /> Add another</Button>
                {task && canMessage(task) && (
                  <Button size="sm" variant="ghost" onClick={() => { setMessageFor(task); setMessageOpen(true); }}><MessageSquareText aria-hidden="true" /> Message</Button>
                )}
              </>
            }>
            <p className="text-xs text-muted-foreground">Cheapest first. Quotes read by AI keep their AI badge, so you always know where a number came from.</p>
            <div className="mt-3 grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {plan.quote_comparisons[line.key].map((comparison) => {
                const quote = quotes.get(comparison.quote_id);
                return quote && <QuoteCard key={quote.id} quote={quote} comparison={comparison} onEdit={() => setEditing(quote)} />;
              })}
            </div>
          </Panel>
        );
      })}

      {ignored.length > 0 && (
        <Panel title="Not in this plan" description="These quotes are for budget lines this plan doesn't have. They're kept safe in case you switch back.">
          <ul className="space-y-1 text-sm">{ignored.map((q) => <li key={q.id}>{q.vendor || "Unnamed vendor"} ({q.category})</li>)}</ul>
        </Panel>
      )}

      <QuoteEditor quote={editing} onClose={() => setEditing(null)} />
      <MessageDialog taskId={messageFor} open={messageOpen} onOpenChange={setMessageOpen} />
    </div>
  );
}
