// Mark a booking done, or delayed to the date the vendor can confirm. The engine works out
// the ripple: what waits on it, what's now late, and what moves in the timeline.

import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/field-error";
import { addDays, formatDate } from "@/lib/format";
import { taskShortName } from "@/lib/tasks";
import type { TaskState } from "@/lib/types";
import { useReturnFocus } from "@/lib/use-return-focus";
import { usePlan } from "@/state/planner";

export interface BookingTarget {
  taskId: string;
  state: TaskState;
}

export function BookingDialog({ target, onClose }: { target: BookingTarget | null; onClose: () => void }) {
  const { plan, updateProgress } = usePlan();
  const item = plan.checklist.find((i) => i.id === target?.taskId);
  const [date, setDate] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!target) return;
    setError("");
    setDate(target.state === "booked" ? plan.today : item?.expected_on ?? addDays(plan.today, 7));
  }, [target]);

  // Closing unmounts the dialog, which skips Radix's own focus return, and a booked task's
  // "Mark booked" is gone by then: its row's "More" button takes focus instead.
  const returnFocus = useReturnFocus(Boolean(target), () =>
    item ? document.querySelector<HTMLElement>(`button[aria-label="More for ${CSS.escape(item.label)}"]`) : null);
  const close = () => {
    onClose();
    returnFocus();
  };

  if (!target || !item) return null;
  const delayed = target.state === "delayed";
  const name = taskShortName(item.label);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!date) return setError("Please pick a date.");
    setBusy(true);
    setError("");
    try {
      await updateProgress((progress) => {
        progress.tasks[item.id] = { state: target.state, on: date };
        return progress;
      }, delayed ? `The ${name} can confirm from ${formatDate(date)}` : `Booked the ${name}`);
      close();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && close()}>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{delayed ? `When can the ${name} confirm?` : `Booked the ${name}?`}</DialogTitle>
            <DialogDescription>
              {delayed
                ? "Pick the date they gave you. Anything that depends on it moves too, and you'll see what's affected."
                : "It comes off your to-do list, and anything waiting on it can go ahead."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="booking-date">{delayed ? "Vendor can confirm on" : "Booked on"}</Label>
            <Input
              id="booking-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required
              max={delayed ? plan.event_date : plan.today} min={delayed ? plan.today : undefined}
              aria-invalid={Boolean(error)} aria-describedby="booking-error"
            />
            <FieldError id="booking-error">{error}</FieldError>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>Cancel</Button>
            <Button type="submit" disabled={busy}>{delayed ? "Save the new date" : "Mark booked"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
