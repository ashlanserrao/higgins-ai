// Before/after preview for any change that moves numbers. Nothing is applied until the
// organiser confirms; the plan shown is the engine's own result for the edited inputs.

import { useEffect, useState, type ReactNode } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EngineBadge, StatusBadge } from "@/components/badges";
import { FieldError } from "@/components/field-error";
import { ApiError } from "@/lib/api";
import { inr, LEVEL_LABELS, signedInr } from "@/lib/format";
import { DIFF_TASK_LABELS } from "@/lib/tasks";
import type { Plan, PlanDiff, PlanRequest } from "@/lib/types";
import { usePlanner } from "@/state/planner";
import { cn } from "@/lib/utils";

export interface Preview {
  inputs: PlanRequest;
  plan: Plan;
  changes: PlanDiff;
}

function PairRow({ label, before, after, worse }: { label: string; before: ReactNode; after: ReactNode; worse?: boolean }) {
  return (
    <div className="rounded-lg bg-surface-soft p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="num mt-1 flex flex-wrap items-center gap-1.5 text-sm font-semibold">
        <span className="text-muted-foreground line-through decoration-1">{before}</span>
        <ArrowRight className="size-3.5 text-muted-foreground" aria-label="becomes" />
        <span className={cn(worse && "text-danger")}>{after}</span>
      </p>
    </div>
  );
}

export function DiffView({ changes }: { changes: PlanDiff }) {
  const { per_guest_inr: perGuest, days_remaining: days, budget_status: status, budget_level: level } = changes;
  const over = changes.over_budget_inr;
  const pairs = [
    perGuest.before !== perGuest.after && (
      <PairRow key="pg" label="Per guest" before={inr(perGuest.before)} after={inr(perGuest.after)} worse={perGuest.after < perGuest.before} />
    ),
    days.before !== days.after && <PairRow key="d" label="Days to go" before={days.before} after={days.after} worse={days.after < days.before} />,
    status.before !== status.after && (
      <PairRow key="s" label="Budget" before={status.before === "ok" ? "OK" : "Tight"} after={status.after === "ok" ? "OK" : "Tight"} worse={status.after === "tight"} />
    ),
    level.before !== level.after && <PairRow key="l" label="Budget level" before={LEVEL_LABELS[level.before]} after={LEVEL_LABELS[level.after]} />,
    over.before !== over.after && <PairRow key="o" label="Over budget" before={inr(over.before)} after={inr(over.after)} worse={over.after > over.before} />,
    changes.triage_active.before !== changes.triage_active.after && (
      <PairRow key="t" label="Book-today list" before={changes.triage_active.before ? "Yes" : "No"} after={changes.triage_active.after ? "Yes" : "No"} worse={changes.triage_active.after} />
    ),
  ].filter(Boolean);

  const nothing = !pairs.length && !changes.lines.length && !changes.tasks.length &&
    !changes.warnings_added.length && !changes.warnings_removed.length;
  if (nothing) return <p className="text-sm text-muted-foreground">This doesn't change anything in your plan.</p>;

  return (
    <div className="space-y-4">
      <ul className="space-y-1 text-sm font-medium">
        {changes.summary.map((line) => <li key={line}>{line}</li>)}
      </ul>
      {pairs.length > 0 && <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{pairs}</div>}

      {changes.lines.length > 0 && (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow className="bg-surface-soft">
                <TableHead>Budget line</TableHead>
                <TableHead className="text-right">Before</TableHead>
                <TableHead className="text-right">After</TableHead>
                <TableHead className="text-right">Change</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="num">
              {changes.lines.map((line) => (
                <TableRow key={line.key}>
                  <TableCell className="whitespace-normal">{line.label}</TableCell>
                  <TableCell className="text-right">{line.before_inr === null ? "Not in plan" : inr(line.before_inr)}</TableCell>
                  <TableCell className="text-right">{line.after_inr === null ? "Removed" : inr(line.after_inr)}</TableCell>
                  <TableCell className="text-right font-medium">
                    {signedInr(line.delta_inr)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {changes.tasks.length > 0 && (
        <div>
          <h3 className="mb-2 font-sans text-sm font-semibold">Bookings affected</h3>
          <ul className="space-y-1.5 text-sm">
            {changes.tasks.map((task) => (
              <li key={task.id} className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{task.label}:</span>
                <span className="text-muted-foreground">{task.before ? DIFF_TASK_LABELS[task.before] : "Not in plan"}</span>
                <ArrowRight className="size-3.5 text-muted-foreground" aria-label="becomes" />
                <span>{task.after ? DIFF_TASK_LABELS[task.after] : "Removed"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(changes.warnings_added.length > 0 || changes.warnings_removed.length > 0) && (
        <ul className="space-y-2 text-sm">
          {changes.warnings_added.map((w) => (
            <li key={w} className="flex items-start gap-2"><StatusBadge tone="warning" className="shrink-0">New note</StatusBadge><span>{w}</span></li>
          ))}
          {changes.warnings_removed.map((w) => (
            <li key={w} className="flex items-start gap-2"><StatusBadge tone="success" className="shrink-0">Sorted</StatusBadge><span className="text-muted-foreground">{w}</span></li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ChangeDialog({ open, onOpenChange, title, description, label, load, children, confirmLabel = "Apply this change" }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  /** Shown afterwards in "what moved" and in the undo bar. */
  label: string;
  load: () => Promise<Preview | null>;
  children?: ReactNode;
  confirmLabel?: string;
}) {
  const { applyChange } = usePlanner();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPreview(null);
    setError(null);
    setLoading(true);
    load()
      .then((result) => !cancelled && setPreview(result))
      .catch((e) => !cancelled && setError(e instanceof ApiError ? e : new ApiError(String(e))))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // Load once per opening; `load` is recreated on every render by callers.
  }, [open]);

  const apply = () => {
    if (!preview) return;
    applyChange(preview.inputs, preview.plan, label, preview.changes.summary);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] scroll-area overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description ?? "Here's what would change. Nothing happens until you say so."}</DialogDescription>
        </DialogHeader>
        {children}
        <div aria-live="polite" aria-busy={loading}>
          {loading && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Working it out…
            </p>
          )}
          {error && (
            <div className="space-y-1 rounded-lg bg-danger-soft p-3">
              <p className="text-sm font-medium text-danger">{error.message}</p>
              {error.fields.filter((f) => f.message !== error.message).map((f) => <FieldError key={f.field + f.message}>{f.message}</FieldError>)}
            </div>
          )}
          {preview && (
            <div className="space-y-3">
              <EngineBadge />
              <DiffView changes={preview.changes} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Not now</Button>
          <Button onClick={apply} disabled={!preview}>{confirmLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
