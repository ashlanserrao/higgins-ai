// Budget: every line with Estimate / Confirmed and what re-budgeting did. The same card turns
// into the money mover (between lines, with a before/after preview), so it's never a scroll away.

import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, PiggyBank, Scale, Trash2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SourceBadge, StatusBadge } from "@/components/badges";
import { FieldError } from "@/components/field-error";
import { Panel } from "@/components/layout";
import { PageBand } from "@/components/page-band";
import { RebalanceNote } from "@/components/app/rebalance-note";
import { useChangePreview } from "@/components/app/use-change-preview";
import { inr, LEVEL_LABELS, signedInr } from "@/lib/format";
import type { BudgetLine, Plan } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useNav } from "@/state/nav";
import { usePlan } from "@/state/planner";

import { CHART_COLORS } from "./chart-colors";

// Recharts is large: load it only when the Budget page opens.
const BudgetChart = lazy(() => import("./budget-chart"));

function lineNote(plan: Plan, line: BudgetLine) {
  if (line.source === "confirmed") {
    const accepted = plan.quote_comparisons[line.key]?.find((q) => q.accepted);
    return accepted ? `${accepted.vendor || "Accepted quote"}${accepted.calculated ? " (from per-plate price)" : ""}` : "Accepted quote";
  }
  const quotes = plan.quote_comparisons[line.key]?.length ?? 0;
  if (quotes) return `${quotes} quote${quotes > 1 ? "s" : ""} to compare`;
  if (line.key === "contingency") return "Your buffer for surprises";
  return "Typical cost, not a quote yet";
}

export function BudgetTable({ detailed = false }: { detailed?: boolean }) {
  const { plan, inputs } = usePlan();
  const total = plan.budget_lines.reduce((sum, line) => sum + line.amount_inr, 0);
  return (
    <div className="scroll-area overflow-x-auto rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow className="bg-surface-soft">
            <TableHead>Category</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className={cn("hidden", detailed ? "2xl:table-cell" : "md:table-cell")}>Note</TableHead>
            {detailed && <TableHead className="text-right">Planned</TableHead>}
            {detailed && <TableHead className="text-right">Change</TableHead>}
            <TableHead className="text-right">Budget</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="num">
          {plan.budget_lines.map((line, index) => (
            <TableRow key={line.key} className={cn(line.source === "confirmed" && "bg-success-soft/40")}>
              <TableCell className="font-medium whitespace-normal">
                <span className="flex items-center gap-2">
                  {detailed && <span className="size-2.5 shrink-0 rounded-sm" style={{ background: CHART_COLORS[index % 9] }} aria-hidden="true" />}
                  {line.label}
                </span>
                <span className="mt-0.5 flex flex-wrap gap-1">
                  {line.boosted && <span className="rounded-full bg-surface-soft px-2 text-xs font-normal text-muted-foreground">Priority</span>}
                  {line.moved_inr !== 0 && <span className="rounded-full bg-surface-soft px-2 text-xs font-normal text-muted-foreground">Moved {signedInr(line.moved_inr)}</span>}
                </span>
              </TableCell>
              <TableCell><SourceBadge source={line.source} /></TableCell>
              <TableCell className={cn("hidden text-sm whitespace-normal text-muted-foreground", detailed ? "2xl:table-cell" : "md:table-cell")}>{lineNote(plan, line)}</TableCell>
              {detailed && <TableCell className="text-right text-muted-foreground">{inr(line.estimate_inr)}</TableCell>}
              {detailed && (
                <TableCell className={cn("text-right", !line.change_inr && "text-muted-foreground")}>
                  {line.change_inr ? signedInr(line.change_inr) : "—"}
                </TableCell>
              )}
              <TableCell className={cn("text-right font-semibold", line.source === "confirmed" && "text-success")}>{inr(line.amount_inr)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={detailed ? 4 : 2} className={cn("font-medium", detailed ? "2xl:hidden" : "md:hidden")}>Total of {inr(inputs.budget_inr)}</TableCell>
            <TableCell colSpan={detailed ? 5 : 3} className={cn("hidden font-medium", detailed ? "2xl:table-cell" : "md:table-cell")}>Total of {inr(inputs.budget_inr)}</TableCell>
            <TableCell className="num text-right text-base font-semibold">{inr(total)}</TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}

/** The money mover, inside the Every line card. `focusFirst`: opened from Add → Move money. */
function MoveMoney({ focusFirst }: { focusFirst: boolean }) {
  const { plan, inputs } = usePlan();
  const { preview, dialog } = useChangePreview();
  const movable = plan.budget_lines.filter((l) => l.source !== "confirmed");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const fromField = useRef<HTMLButtonElement>(null);
  const moves = inputs.progress.moves;
  const label = (key: string) => plan.budget_lines.find((l) => l.key === key)?.label ?? key;

  useEffect(() => {
    if (focusFirst) fromField.current?.focus();
  }, [focusFirst]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = Number(amount);
    if (!from || !to) return setError("Pick both categories.");
    if (from === to) return setError("Pick two different categories.");
    if (!value || value < 100 || value % 100) return setError("Enter an amount in steps of ₹100.");
    setError("");
    preview({
      title: `Move ${inr(value)} from ${label(from)} to ${label(to)}`,
      label: `Moved ${inr(value)} from ${label(from)} to ${label(to)}`,
      changes: { moves: [...moves, { from_key: from, to_key: to, amount_inr: value }] },
    });
  };

  const remove = (index: number) => {
    const move = moves[index];
    preview({
      title: "Undo this money move",
      label: `Removed the move of ${inr(move.amount_inr)} from ${label(move.from_key)}`,
      changes: { moves: moves.filter((_, i) => i !== index) },
    });
  };

  return (
    // Laid out by the card's own width (it shares a row with the chart on wide screens).
    <div className="@container">
      <form onSubmit={submit} className="grid gap-3 @lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] @lg:items-end" noValidate>
        <div className="grid gap-1.5">
          <Label htmlFor="move-from">From</Label>
          <Select value={from} onValueChange={setFrom}>
            <SelectTrigger id="move-from" ref={fromField} className="w-full"><SelectValue placeholder="Take from…" /></SelectTrigger>
            <SelectContent>{movable.map((l) => <SelectItem key={l.key} value={l.key}>{l.label} · {inr(l.amount_inr)}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <ArrowRight className="hidden size-4 self-center text-muted-foreground @lg:mt-6 @lg:block" aria-hidden="true" />
        <div className="grid gap-1.5">
          <Label htmlFor="move-to">To</Label>
          <Select value={to} onValueChange={setTo}>
            <SelectTrigger id="move-to" className="w-full"><SelectValue placeholder="Give to…" /></SelectTrigger>
            <SelectContent>{movable.filter((l) => l.key !== from).map((l) => <SelectItem key={l.key} value={l.key}>{l.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5 @lg:col-span-3 @md:grid-cols-[1fr_auto] @md:items-end @md:gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="move-amount">Amount (₹, steps of 100)</Label>
            <Input id="move-amount" type="number" inputMode="numeric" min={100} step={100} value={amount} className="num"
              onChange={(e) => setAmount(e.target.value)} aria-invalid={Boolean(error)} aria-describedby="move-error" />
          </div>
          <Button type="submit" disabled={moves.length >= 10}>Preview the move</Button>
        </div>
        <div className="@lg:col-span-3"><FieldError id="move-error">{error}</FieldError></div>
      </form>

      {moves.length > 0 && (
        <ul className="mt-5 space-y-2 border-t pt-5">
          {moves.map((move, index) => {
            const skipped = plan.ignored_moves.includes(index);
            return (
              <li key={`${move.from_key}-${move.to_key}-${index}`} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="num font-medium">{inr(move.amount_inr)}</span>
                <span>{label(move.from_key)} → {label(move.to_key)}</span>
                {skipped && <StatusBadge tone="neutral">Skipped: one of these lines is confirmed or not in this plan</StatusBadge>}
                <Button size="icon-sm" variant="ghost" className="ml-auto" onClick={() => remove(index)} aria-label={`Remove move of ${inr(move.amount_inr)} from ${label(move.from_key)}`}>
                  <Trash2 aria-hidden="true" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      {dialog}
    </div>
  );
}

/** Every line, or (one click away, in the same place) the money mover. */
function LinesCard() {
  const { plan } = usePlan();
  const { consumeIntent } = useNav();
  const [moving, setMoving] = useState(false);
  // Add → Move money lands here with the mover open and its first field focused.
  const [fromMenu, setFromMenu] = useState(false);
  useEffect(() => {
    if (!consumeIntent("move-money")) return;
    setMoving(true);
    setFromMenu(true);
  }, [consumeIntent]);
  const toggle = (
    <Button variant="outline" size="sm" onClick={() => { setMoving(!moving); setFromMenu(false); }}>
      {moving ? <><ArrowLeft aria-hidden="true" /> Every line</> : <><Scale aria-hidden="true" /> Move money</>}
    </Button>
  );

  return moving ? (
    <Panel title="Move money" icon={Scale} actions={toggle} className="xl:self-start" description="Shift budget between categories. Lines with an accepted quote stay as they are.">
      <MoveMoney focusFirst={fromMenu} />
    </Panel>
  ) : (
    <Panel title="Every line" icon={Wallet} actions={toggle} className="xl:self-start">
      <div className="space-y-4">
        <RebalanceNote />
        <BudgetTable detailed />
        {plan.per_flat_inr !== null && (
          <p className="text-sm">Per-flat contribution: <span className="num font-semibold">{inr(plan.per_flat_inr)}</span></p>
        )}
      </div>
    </Panel>
  );
}

export function BudgetSection() {
  const { plan, inputs } = usePlan();
  return (
    <div className="space-y-6">
      <PageBand
        eyebrow={`${inr(inputs.budget_inr)} · ${inr(plan.per_guest_inr)} per guest · ${LEVEL_LABELS[plan.budget_level]} budget`}
        title="Budget"
        description="Estimates are typical costs for Indian events like yours. A line turns Confirmed when you accept a quote, and the rest adjusts around it."
      />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <LinesCard />
        <div className="space-y-6">
          <Panel title="Split">
            <Suspense fallback={<div className="h-56" />}><BudgetChart /></Suspense>
            <p className="sr-only">The table lists every line with its amount.</p>
          </Panel>
          {plan.cost_saving_swaps.length > 0 && (
            <Panel title="Ways to save" icon={PiggyBank} description="Your budget is tight for this many guests. These swaps usually help.">
              <ul className="list-disc space-y-1 pl-5 text-sm">{plan.cost_saving_swaps.map((s) => <li key={s}>{s}</li>)}</ul>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
