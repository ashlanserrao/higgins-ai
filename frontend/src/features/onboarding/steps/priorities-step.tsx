import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FieldError } from "@/components/common";
import type { EventType, Options } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Field } from "../fields";
import type { StepProps } from "../form";

/** Step 3: what gets a bigger share, must-haves and taste. */
export function PrioritiesStep({ values, set, err, describedBy, priorities }: StepProps & { priorities: Options[EventType] }) {
  return (
    <div className="space-y-5">
      <fieldset>
        <legend className="mb-2 text-sm font-medium">What matters most? <span className="font-normal text-muted-foreground">(up to 3, each gets a bigger share)</span></legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {priorities.map(({ key, label }) => {
            const checked = values.priorities.includes(key);
            const full = !checked && values.priorities.length >= 3;
            return (
              <div key={key} className="flex items-center gap-2">
                <Checkbox id={`p-${key}`} checked={checked} disabled={full}
                  onCheckedChange={(c) => set("priorities", c ? [...values.priorities, key] : values.priorities.filter((p) => p !== key))} />
                <Label htmlFor={`p-${key}`} className={cn("font-normal", full && "text-muted-foreground")}>{label}</Label>
              </div>
            );
          })}
        </div>
        <FieldError>{err("priorities")}</FieldError>
      </fieldset>
      <Field id="must_haves" label="Must-haves (optional)" error={err("must_haves")} hint={`Things you won't give up. Ideas always include them. ${values.must_haves.length} / 300`}>
        <Textarea id="must_haves" rows={2} maxLength={300} value={values.must_haves} placeholder="e.g. Jain food, live dhol, wheelchair access"
          onChange={(e) => set("must_haves", e.target.value)} aria-describedby={describedBy("must_haves")} />
      </Field>
      <Field id="preferences" label="Your taste and ideas (optional)" error={err("preferences")} hint={`${values.preferences.length} / 500`}>
        <Textarea id="preferences" rows={3} maxLength={500} value={values.preferences} placeholder="e.g. Pastel colours, South Indian vegetarian menu"
          onChange={(e) => set("preferences", e.target.value)} aria-describedby={describedBy("preferences")} />
      </Field>
    </div>
  );
}
