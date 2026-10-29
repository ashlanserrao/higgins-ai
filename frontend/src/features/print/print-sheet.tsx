// The printout: one A4 page for the family, whatever section is open. It sits hidden at the
// page's width, so just before printing it can be measured and, for a big event, scaled down to
// fit the sheet. Printing shows it alone (index.css, "Print sheet").
//
// Black-and-white safe: status is in words and weight, colour only adds to it, and nothing
// relies on a background (most printers drop them).

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { LogoMark } from "@/components/brand";
import {
  EVENT_LABELS, LEVEL_LABELS, VENUE_LABELS, countdown, eventName, formatDate, formatShortDate, inr, plural, titleCase, weekday,
} from "@/lib/format";
import { expectedGuests } from "@/lib/guests";
import type { TaskTone } from "@/lib/tasks";
import { cn } from "@/lib/utils";
import { usePlanner } from "@/state/planner";
import { sheetBookings, sheetDates, sheetGuests, sheetIdeas, sheetVendors } from "./sheet-data";

const PAGE_MM = 297 - 2 * 12; // A4 less the @page margins

const TONE: Record<TaskTone, string> = {
  danger: "font-semibold text-danger",
  warning: "font-medium text-warning",
  success: "text-success",
  neutral: "text-muted-foreground",
};

export function PrintSheet() {
  const { plan, inputs, guests, ideas, events, activeId } = usePlanner();
  const sheet = useRef<HTMLDivElement>(null);

  // Measured as late as possible, once fonts and the latest plan are in.
  useEffect(() => {
    const fit = () => {
      const el = sheet.current;
      if (!el) return;
      el.style.removeProperty("--sheet-zoom");
      const mm = (el.getBoundingClientRect().height * 25.4) / 96;
      if (mm > PAGE_MM) el.style.setProperty("--sheet-zoom", String(PAGE_MM / mm));
    };
    window.addEventListener("beforeprint", fit);
    return () => window.removeEventListener("beforeprint", fit);
  }, []);

  if (!plan || !inputs) return null;
  const event = events.find((e) => e.id === activeId);
  const name = eventName({ name: event?.name ?? "", inputs });
  const bookings = sheetBookings(plan);
  const vendors = sheetVendors(plan);
  const people = guests.length ? sheetGuests(guests) : null;
  const picks = ideas ? sheetIdeas(ideas) : [];
  const total = plan.budget_lines.reduce((sum, line) => sum + line.amount_inr, 0);
  const over = plan.rebalance?.over_budget_inr ?? 0;
  const attention = bookings.open.filter((b) => b.badge.tone === "danger" || b.badge.tone === "warning").length;
  const notes = [["Must-haves", inputs.must_haves], ["Preferences", inputs.preferences]].filter(([, text]) => text.trim());

  return createPortal(
    <div ref={sheet} className="print-sheet text-[9pt] leading-snug text-foreground">
      <header className="flex items-start justify-between gap-6 border-b-2 border-primary pb-3">
        <div className="min-w-0">
          <p className="text-[7.5pt] font-semibold tracking-[0.14em] text-primary-text uppercase">{EVENT_LABELS[plan.event_type]} plan</p>
          <h1 className="mt-1 text-[20pt] leading-tight">{name}</h1>
          <p className="mt-1 text-muted-foreground">
            {weekday(plan.event_date)}, {formatDate(plan.event_date)} · {titleCase(inputs.city.trim())} · {VENUE_LABELS[inputs.venue_type]}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-right text-[7.5pt] text-muted-foreground">
          <div>
            <p className="font-semibold text-foreground">Higgins AI</p>
            <p>As of {formatDate(plan.today)}</p>
          </div>
          <LogoMark className="size-8" />
        </div>
      </header>

      <dl className="grid grid-cols-4 border-b">
        <Figure label="Days to go" value={plan.days_remaining > 0 ? String(plan.days_remaining) : countdown(plan.event_date)}>
          until {formatShortDate(plan.event_date)}
        </Figure>
        <Figure label="Budget" value={inr(inputs.budget_inr)}>
          {LEVEL_LABELS[plan.budget_level]} · {inr(plan.per_guest_inr)} a guest
        </Figure>
        <Figure label="Guests" value={String(inputs.guests)}>
          {people ? `${expectedGuests(guests)} expected so far` : inputs.households ? plural(inputs.households, "household") : "planned"}
        </Figure>
        <Figure label="Bookings" value={`${bookings.booked.length} of ${plan.checklist.length}`}>
          {attention ? `${attention} need${attention === 1 ? "s" : ""} attention` : "booked, the rest on track"}
        </Figure>
      </dl>

      <Block title="Needs attention" className="mt-4">
        {plan.warnings.length || over ? (
          <ul className="space-y-0.5 border-l-[3px] border-danger pl-3">
            {over > 0 && <li className="font-semibold">Over budget by {inr(over)}.</li>}
            {plan.warnings.slice(0, 3).map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        ) : (
          <p className="border-l-[3px] border-success pl-3">Nothing urgent: every booking is on track.</p>
        )}
      </Block>

      <div className="mt-4 grid grid-cols-[5fr_6fr] gap-6">
        <Block title="Budget">
          <table className="w-full">
            <thead><Row head right={[1]} cells={["Category", "Amount", ""]} /></thead>
            <tbody>
              {plan.budget_lines.map((line) => (
                <Row key={line.key} right={[1]} cells={[
                  line.label,
                  inr(line.amount_inr),
                  line.source === "confirmed" ? <span className="text-success">✓ Quote</span> : <span className="text-muted-foreground">Estimate</span>,
                ]} />
              ))}
            </tbody>
            <tfoot><Row total right={[1]} cells={["Total", inr(total), ""]} /></tfoot>
          </table>
        </Block>

        <Block title="Bookings">
          {bookings.open.length ? (
            <table className="w-full">
              <thead><Row head cells={["Book by", "Booking", "Status"]} /></thead>
              <tbody>
                {bookings.open.map((b) => (
                  <Row key={b.id} cells={[
                    b.due ? formatShortDate(b.due) : <span className="font-semibold">{b.late}</span>,
                    b.label,
                    <span className={TONE[b.badge.tone]}>{b.badge.label}</span>,
                  ]} />
                ))}
              </tbody>
            </table>
          ) : (
            <p>Every booking is made.</p>
          )}
          {bookings.more > 0 && <p className="mt-1 text-muted-foreground">And {plural(bookings.more, "more booking")} after these.</p>}
          <p className="mt-2">
            <span className="font-semibold">Booked: </span>
            {bookings.booked.length ? <span className="text-success">✓ {bookings.booked.join(", ")}</span> : <span className="text-muted-foreground">nothing yet</span>}
          </p>
        </Block>
      </div>

      <Block title="Key dates" className="mt-4">
        <ol className="grid auto-cols-fr grid-flow-col gap-3">
          {sheetDates(plan).map((entry) => {
            const day = entry.kind === "event";
            return (
              <li key={`${entry.date}-${entry.label}`} className={cn("border-t-2 pt-1.5", day ? "border-primary" : "border-border")}>
                <p className={cn("num font-semibold", day && "text-primary-text")}>{formatShortDate(entry.date)}</p>
                <p className={cn("text-[8pt]", day ? "font-semibold" : "text-muted-foreground")}>{entry.label}</p>
              </li>
            );
          })}
        </ol>
      </Block>

      <div className="mt-4 grid grid-cols-2 gap-6">
        <Block title="Vendors">
          {vendors.length ? (
            <table className="w-full">
              <thead><Row head right={[2]} cells={["For", "Vendor", "Quote"]} /></thead>
              <tbody>
                {vendors.map((v) => (
                  <Row key={v.key} right={[2]} cells={v.accepted ? [
                    v.label,
                    <span><span className="text-success">✓</span> {v.accepted.vendor}</span>,
                    v.accepted.total_inr === null ? "Not stated" : inr(v.accepted.total_inr),
                  ] : [
                    v.label,
                    <span className="text-muted-foreground">{plural(v.quotes, "quote")}, none chosen</span>,
                    "",
                  ]} />
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-muted-foreground">No quotes yet. The budget above is an estimate until one is accepted.</p>
          )}
        </Block>

        <Block title="Guests">
          {people ? (
            <>
              <dl className="grid grid-cols-4 gap-2">
                <Count label="Coming" value={people.yes} />
                <Count label="Maybe" value={people.maybe} />
                <Count label="No reply" value={people.invited} />
                <Count label="Not coming" value={people.no} />
              </dl>
              <table className="mt-2 w-full">
                <thead><Row head right={[1, 2]} cells={["Group", "Invited", "Expected"]} /></thead>
                <tbody>
                  {people.groups.map((g) => <Row key={g.name} right={[1, 2]} cells={[g.name, String(g.invited), String(g.expected)]} />)}
                </tbody>
              </table>
              {people.moreGroups > 0 && <p className="mt-1 text-muted-foreground">And {plural(people.moreGroups, "more group")}.</p>}
            </>
          ) : (
            <p className="text-muted-foreground">No guest list yet. The plan is for {plural(inputs.guests, "guest")}.</p>
          )}
        </Block>
      </div>

      {picks.length > 0 && (
        <Block title="Ideas" note="Suggested by Higgins AI" className="mt-4">
          <dl className="grid grid-cols-4 gap-4">
            {picks.map(({ label, idea }) => (
              <div key={label}>
                <dt className="text-[7.5pt] text-muted-foreground">{label}</dt>
                <dd className="font-medium">{idea.title}</dd>
              </div>
            ))}
          </dl>
        </Block>
      )}

      {notes.length > 0 && (
        <Block title="Notes" className="mt-4">
          {notes.map(([label, text]) => (
            <p key={label} className="line-clamp-2"><span className="font-semibold">{label}: </span>{text}</p>
          ))}
        </Block>
      )}

      <footer className="mt-5 border-t pt-2 text-[7pt] text-muted-foreground">
        Amounts are estimates until a vendor's quote is accepted. Dates count back from {formatDate(plan.event_date)}.
      </footer>
    </div>,
    document.body,
  );
}

function Block({ title, note, className, children }: { title: string; note?: string; className?: string; children: ReactNode }) {
  return (
    <section className={cn("break-inside-avoid", className)}>
      <h2 className="mb-1.5 flex items-baseline gap-2 font-sans text-[7.5pt] font-semibold tracking-[0.12em] text-primary-text uppercase">
        {title}
        {note && <span className="font-normal tracking-normal text-muted-foreground normal-case">{note}</span>}
      </h2>
      {children}
    </section>
  );
}

function Figure({ label, value, children }: { label: string; value: string; children: ReactNode }) {
  return (
    <div className="border-l py-2.5 pl-3 first:border-l-0 first:pl-0">
      <dt className="text-[7.5pt] text-muted-foreground">{label}</dt>
      <dd className="num font-display text-[15pt] leading-tight font-semibold">{value}</dd>
      <dd className="text-[7.5pt] text-muted-foreground">{children}</dd>
    </div>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-[7.5pt] text-muted-foreground">{label}</dt>
      <dd className="num text-[11pt] font-semibold">{value}</dd>
    </div>
  );
}

/** A table row. `right`: the columns holding figures, aligned on the right. */
function Row({ cells, head, total, right = [] }: { cells: ReactNode[]; head?: boolean; total?: boolean; right?: number[] }) {
  const Cell = head ? "th" : "td";
  return (
    <tr className={cn("border-b", head ? "text-[7.5pt] text-muted-foreground" : "border-border/70", total && "border-t border-b-0 font-semibold")}>
      {cells.map((cell, i) => (
        <Cell
          key={i} scope={head ? "col" : undefined}
          className={cn("py-[3px] pr-3 text-left align-top font-[inherit] last:pr-0", right.includes(i) && "num text-right")}
        >
          {cell}
        </Cell>
      ))}
    </tr>
  );
}
