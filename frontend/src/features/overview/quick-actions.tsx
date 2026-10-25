// One-tap changes, each previewed as before/after by the engine before anything is applied.

import { useState, type FormEvent } from "react";
import { CalendarClock, IndianRupee, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useChangePreview } from "@/components/use-change-preview";
import { addDays, formatDate, inr } from "@/lib/format";
import { usePlan } from "@/state/planner";

/** +20%, rounded to ₹1,000 like the server does for typed revisions. */
const raiseBudget = (budget: number, percent: number) => Math.round((budget * (1 + percent / 100)) / 1000) * 1000;

export function QuickActions({ suggestedBudget }: { suggestedBudget?: number }) {
  const { inputs, plan } = usePlan();
  const { preview, dialog } = useChangePreview();
  const [dateOpen, setDateOpen] = useState(false);
  const [date, setDate] = useState(inputs.event_date);

  const budget = suggestedBudget ?? raiseBudget(inputs.budget_inr, 20);
  const guests = Math.min(inputs.guests + 25, 5000);

  const moveDate = (event: FormEvent) => {
    event.preventDefault();
    if (!date || date === inputs.event_date) return;
    setDateOpen(false);
    preview({ title: `Move the event to ${formatDate(date)}`, label: `Moved the event to ${formatDate(date)}`, changes: { event_date: date } });
  };

  return (
    <>
      <Button variant="outline" size="sm"
        onClick={() => preview({ title: `Budget ${inr(budget)}`, label: `Budget raised to ${inr(budget)}`, changes: { budget_inr: budget } })}>
        <IndianRupee aria-hidden="true" /> {suggestedBudget ? `Budget ${inr(budget)}` : "+20% budget"}
      </Button>
      <Button variant="outline" size="sm"
        onClick={() => preview({ title: `Plan for ${guests} guests`, label: `${guests} guests (+25)`, changes: { guests } })}>
        <UserPlus aria-hidden="true" /> +25 guests
      </Button>
      <Button variant="outline" size="sm" onClick={() => { setDate(inputs.event_date); setDateOpen(true); }}>
        <CalendarClock aria-hidden="true" /> Move the date
      </Button>

      <Dialog open={dateOpen} onOpenChange={setDateOpen}>
        <DialogContent>
          <form onSubmit={moveDate} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>Move the date</DialogTitle>
              <DialogDescription>Your bookings, quotes and guests stay. You'll see what moves before anything changes.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-1.5">
              <Label htmlFor="new-date">New event date</Label>
              <Input id="new-date" type="date" value={date} min={addDays(plan.today, 1)} onChange={(e) => setDate(e.target.value)} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDateOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={!date || date === inputs.event_date}>See what changes</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {dialog}
    </>
  );
}
