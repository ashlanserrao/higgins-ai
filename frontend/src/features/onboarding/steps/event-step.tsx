import { Cake, Heart, Users, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addDays, EVENT_LABELS, todayInIndia } from "@/lib/format";
import type { EventType } from "@/lib/types";
import { ChoiceCards, Field } from "../fields";
import type { StepProps } from "../form";

const EVENT_ICONS: Record<EventType, LucideIcon> = { wedding: Heart, birthday: Cake, community: Users };
const GUEST_PICKS = [50, 100, 200, 300];

/** Step 1: the occasion, its date and how many are coming. */
export function EventStep({ values, set, err, describedBy, flash }: StepProps) {
  return (
    <div className="space-y-5">
      <ChoiceCards
        legend="What are you planning?" name="event_type" value={values.event_type}
        options={(Object.keys(EVENT_LABELS) as EventType[]).map((v) => ({ value: v, label: EVENT_LABELS[v], icon: EVENT_ICONS[v] }))}
        onChange={(v) => set("event_type", v)} error={err("event_type")} flash={flash === "event_type"}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="event_date" label="Event date" error={err("event_date")} flash={flash === "event_date"}>
          <Input id="event_date" type="date" required value={values.event_date} min={addDays(todayInIndia(), 1)}
            onChange={(e) => set("event_date", e.target.value)} aria-invalid={Boolean(err("event_date"))} aria-describedby={describedBy("event_date")} />
        </Field>
        <Field id="guests" label="Number of guests" error={err("guests")} flash={flash === "guests"}>
          <Input id="guests" inputMode="numeric" pattern="[0-9]*" autoComplete="off" required value={values.guests} placeholder="e.g. 150"
            onChange={(e) => set("guests", e.target.value)} aria-invalid={Boolean(err("guests"))} aria-describedby={describedBy("guests")} />
          <div className="flex flex-wrap gap-2" role="group" aria-label="Quick picks for guests">
            {GUEST_PICKS.map((count) => (
              <Button key={count} type="button" size="sm" variant="outline" className="num h-11 min-w-11 rounded-full sm:h-9"
                aria-pressed={values.guests === String(count)} onClick={() => set("guests", String(count))}>
                {count}
              </Button>
            ))}
          </div>
        </Field>
      </div>
    </div>
  );
}
