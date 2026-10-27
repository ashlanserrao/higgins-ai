// Field wrappers shared by the questionnaire steps.

import type { ReactNode } from "react";
import { Check, type LucideIcon } from "lucide-react";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/field-error";
import { cn } from "@/lib/utils";

export function ChoiceCards<T extends string>({ legend, name, value, options, onChange, error, flash }: {
  legend: string; name: string; value: T | ""; options: { value: T; label: string; icon?: LucideIcon }[]; onChange: (v: T) => void;
  error?: string; flash?: boolean;
}) {
  return (
    <fieldset aria-describedby={error ? `${name}-error` : undefined} className={cn("rounded-lg", flash && "animate-filled")}>
      <legend className="mb-2 text-sm font-medium">{legend}</legend>
      <div className="grid gap-2 sm:grid-cols-3">
        {options.map(({ value: v, label, icon: Icon }) => (
          <label
            key={v}
            className={cn(
              "flex min-h-12 cursor-pointer items-center gap-2 rounded-lg border bg-card px-4 py-3 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
              value === v ? "border-primary-text bg-primary-soft font-semibold text-primary-ink" : "border-input hover:bg-surface-soft",
            )}
          >
            <input type="radio" name={name} value={v} checked={value === v} onChange={() => onChange(v)} className="sr-only" />
            {Icon && <Icon className="size-4" aria-hidden="true" />}
            {label}
            {value === v && <Check className="ml-auto size-4" aria-hidden="true" />}
          </label>
        ))}
      </div>
      <FieldError id={`${name}-error`}>{error}</FieldError>
    </fieldset>
  );
}

export function Field({ id, label, error, hint, flash, children }: {
  id: string; label: string; error?: string; hint?: ReactNode; flash?: boolean; children: ReactNode;
}) {
  return (
    <div className={cn("grid content-start gap-1.5 rounded-lg", flash && "animate-filled")}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && !error && <p id={`${id}-hint`} className="text-xs text-muted-foreground">{hint}</p>}
      <FieldError id={`${id}-error`}>{error}</FieldError>
    </div>
  );
}
