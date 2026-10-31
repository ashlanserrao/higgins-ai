import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { shortInr, VENUE_LABELS } from "@/lib/format";
import type { VenueType } from "@/lib/types";
import { ChoiceCards, Field } from "../fields";
import type { StepProps } from "../form";

/** Step 2: budget, city and venue. */
export function PlaceStep({ values, set, err, describedBy, flash }: StepProps) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="budget_inr" label="Total budget (₹)" error={err("budget_inr")} flash={flash === "budget_inr"}
          hint={values.budget_inr ? shortInr(Number(values.budget_inr)) : "Your all-in budget, in rupees"}
        >
          <div className="relative">
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground" aria-hidden="true">₹</span>
            <Input id="budget_inr" type="number" inputMode="numeric" min={1000} max={100000000} step={1000} required className="num pl-7"
              value={values.budget_inr} onChange={(e) => set("budget_inr", e.target.value)}
              aria-invalid={Boolean(err("budget_inr"))} aria-describedby={describedBy("budget_inr")} />
          </div>
        </Field>
        <Field id="city" label="City" error={err("city")} flash={flash === "city"}>
          <Input id="city" autoComplete="address-level2" maxLength={60} required value={values.city}
            onChange={(e) => set("city", e.target.value)} aria-invalid={Boolean(err("city"))} aria-describedby={describedBy("city")} />
        </Field>
        <Field id="city_tier" label="City size" error={err("city_tier")}>
          <Select value={values.city_tier || "auto"} onValueChange={(v) => set("city_tier", v === "auto" ? "" : v)}>
            <SelectTrigger id="city_tier" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Work it out from the city</SelectItem>
              <SelectItem value="1">Metro</SelectItem>
              <SelectItem value="2">Tier-2 city</SelectItem>
              <SelectItem value="3">Smaller town</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        {values.event_type === "community" && (
          <Field id="households" label="Households (optional)" error={err("households")} hint="Used to work out a per-flat contribution.">
            <Input id="households" type="number" inputMode="numeric" min={1} max={10000} value={values.households}
              onChange={(e) => set("households", e.target.value)} aria-describedby={describedBy("households")} />
          </Field>
        )}
      </div>
      <ChoiceCards
        legend="Where is it?" name="venue_type" value={values.venue_type}
        options={(Object.keys(VENUE_LABELS) as VenueType[]).map((v) => ({ value: v, label: VENUE_LABELS[v] }))}
        onChange={(v) => set("venue_type", v)}
      />
      {values.venue_type === "venue" && (
        <div className="flex items-center gap-2">
          <Checkbox id="catering" checked={values.venue_includes_catering} onCheckedChange={(c) => set("venue_includes_catering", c === true)} />
          <Label htmlFor="catering" className="font-normal">The venue includes catering</Label>
        </div>
      )}
    </div>
  );
}
