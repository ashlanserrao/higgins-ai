// Step-by-step questionnaire, with a plain-language box that fills it in. Used for a new
// plan and for editing one: the same event type keeps bookings, quotes, moves and guests.
// For a new event the box is the main path; the steps are the fallback and the place to check.

import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AiBadge, StatusBadge } from "@/components/badges";
import { FieldError } from "@/components/field-error";
import { ApiError } from "@/lib/api";
import { EVENT_LABELS } from "@/lib/format";
import { emptyProgress } from "@/lib/share";
import type { UnderstandResponse } from "@/lib/types";
import { cn } from "@/lib/utils";
import { usePlanner } from "@/state/planner";
import { DescribeBox } from "./describe-box";
import {
  blank, FIELD_NAMES, FIELD_STEP, FILL_ORDER, fromInputs, hasProgress as anyProgress, STEPS, stepErrors, TIME_LEFT,
  toPlanRequest, type SetValue, type StepProps, type Values,
} from "./form";
import { EventStep } from "./steps/event-step";
import { PlaceStep } from "./steps/place-step";
import { PrioritiesStep } from "./steps/priorities-step";

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function Questionnaire({ onDone, onCancel, initialText = "" }: { onDone?: () => void; onCancel?: () => void; initialText?: string }) {
  const { options, inputs: current, guests, events, makePlan, bootError } = usePlanner();
  const editing = Boolean(current && onCancel);
  // A new event starts with no type picked, or the type of the most recently added event.
  const [values, setValues] = useState<Values>(() =>
    current ? fromInputs(current) : { ...blank, event_type: events.at(-1)?.inputs.event_type ?? "" });
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState(bootError);
  const [filled, setFilled] = useState<UnderstandResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmFresh, setConfirmFresh] = useState(false);
  const [aiPath, setAiPath] = useState(Boolean(initialText.trim())); // typing in the box: its button is the main one
  const [filling, setFilling] = useState<{ values: Values; keys: (keyof Values)[]; step: number } | null>(null);
  const [flash, setFlash] = useState<keyof Values | null>(null);

  // A new plan previews its event's colours as the type is picked; App sets them otherwise.
  useEffect(() => {
    if (!editing) document.documentElement.dataset.event = values.event_type || "wedding";
  }, [editing, values.event_type]);

  const set: SetValue = (key, value) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors(({ [key]: _gone, ...rest }) => rest);
  };
  const priorities = (values.event_type && options?.[values.event_type]) || [];

  const onFilled = (result: UnderstandResponse) => {
    const next = fromInputs(result.inputs, values);
    const target = result.missing.map((f) => FIELD_STEP[f]).sort()[0] ?? 2;
    setFilled(result);
    setErrors(Object.fromEntries(result.missing.map((f) => [f, `Please enter the ${FIELD_NAMES[f] ?? f}.`])));
    const keys = FILL_ORDER.filter((key) => next[key] !== values[key]);
    if (!keys.length || reducedMotion()) {
      setValues(next);
      setStep(target);
      return;
    }
    setStep(FIELD_STEP[keys[0]]);
    setFilling({ values: next, keys, step: target });
  };

  // Fill one understood value at a time, on its own step, then land where checking is needed.
  useEffect(() => {
    if (!filling) return;
    const timer = window.setTimeout(() => {
      const [key, ...rest] = filling.keys;
      if (!key) {
        setValues(filling.values);
        setStep(filling.step);
        setFlash(null);
        setFilling(null);
        return;
      }
      setStep(FIELD_STEP[key]);
      setValues((v) => ({ ...v, [key]: filling.values[key] }));
      setFlash(key);
      setFilling({ ...filling, keys: rest });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [filling]);

  const next = () => {
    const found = stepErrors(values, step);
    setErrors(found);
    if (!Object.keys(found).length) setStep((s) => s + 1);
  };

  const hasProgress = anyProgress(current, guests.length);

  const submit = async (fresh: boolean) => {
    setConfirmFresh(false);
    setBusy(true);
    setFormError("");
    try {
      const progress = !fresh && current ? current.progress : emptyProgress();
      await makePlan(toPlanRequest(values, priorities, progress), { fresh, guests: fresh ? [] : undefined });
      onDone?.();
    } catch (error) {
      const e = error as ApiError;
      const fieldErrors = Object.fromEntries((e.fields || []).map((f) => [f.field, f.message]));
      setErrors(fieldErrors);
      setFormError(e.message);
      const first = Object.keys(fieldErrors).map((f) => FIELD_STEP[f]).filter((s) => s !== undefined).sort()[0];
      if (first !== undefined) setStep(first);
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (step < STEPS.length - 1) return next();
    const typeChanged = Boolean(current && current.event_type !== values.event_type);
    if (editing && typeChanged && hasProgress) return setConfirmFresh(true);
    void submit(!editing || typeChanged);
  };

  const err = (name: string) => errors[name];
  const describedBy = (name: string) => (err(name) ? `${name}-error` : `${name}-hint`);
  const stepProps: StepProps = { values, set, err, describedBy, flash };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      {!editing && (
        <>
          <DescribeBox initialText={initialText} active={aiPath} onFilled={onFilled} onTyping={setAiPath} />
          <p className="flex items-center gap-3 text-sm text-muted-foreground">
            <span className="h-px flex-1 bg-border" aria-hidden="true" />
            Or fill it in step by step
            <span className="h-px flex-1 bg-border" aria-hidden="true" />
          </p>
        </>
      )}

      <form onSubmit={onSubmit} noValidate className="rounded-xl bg-card p-5 shadow-card md:p-7">
        <ol className="mb-6 grid grid-cols-3 gap-2" aria-label="Steps">
          {STEPS.map((name, index) => (
            <li key={name}>
              <button
                type="button"
                onClick={() => index < step && setStep(index)}
                aria-current={index === step ? "step" : undefined}
                className={cn(
                  "w-full border-t-4 pt-2 text-left text-xs font-medium md:text-sm",
                  index <= step ? "border-primary-text text-foreground" : "border-surface-soft text-muted-foreground",
                )}
              >
                <span className="block text-xs text-muted-foreground">Step {index + 1}</span>
                {name}
              </button>
            </li>
          ))}
        </ol>

        {filled && (
          <div className="mb-5 space-y-2 rounded-lg bg-ai-soft p-4 text-sm ring-1 ring-ai-border" aria-live="polite">
            <p className="flex flex-wrap items-center gap-2 font-medium"><AiBadge>Filled in by AI</AiBadge> Have a quick look, then carry on.</p>
            {filled.fields.length > 0 && <p>{filled.fields.map((f) => f.label).join(", ")}.</p>}
            {filled.missing.length > 0 && (
              <p className="text-danger">Still needed: {filled.missing.map((f) => FIELD_NAMES[f] ?? f).join(", ")}.</p>
            )}
            {filled.unclear.map((u) => <p key={u} className="text-muted-foreground">Not sure: {u}</p>)}
            {filled.errors.map((e) => <FieldError key={e.field}>{e.message}</FieldError>)}
          </div>
        )}

        {formError && (
          <p role="alert" className="mb-4 rounded-lg bg-danger-soft p-4 text-sm font-medium text-danger">{formError}</p>
        )}

        {step === 0 && <EventStep {...stepProps} />}
        {step === 1 && <PlaceStep {...stepProps} />}
        {step === 2 && <PrioritiesStep {...stepProps} priorities={priorities} />}

        <div className="mt-7 flex flex-col-reverse gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-2">
            {step > 0 && (
              <Button type="button" variant="outline" onClick={() => setStep((s) => s - 1)}>
                <ArrowLeft aria-hidden="true" /> Back
              </Button>
            )}
            {/* A new event can be cancelled from the first step, back to the event that was open. */}
            {onCancel && (editing || step === 0) && <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>}
          </div>
          <div className="flex flex-col-reverse items-stretch gap-2 sm:flex-row sm:items-center sm:gap-4">
            {!editing && <span className="text-center text-sm text-muted-foreground">{TIME_LEFT[step]}</span>}
            {step < STEPS.length - 1 ? (
              <Button type="submit" size="lg" variant={aiPath ? "outline" : "default"} className="w-full sm:w-auto">
                Next <ArrowRight aria-hidden="true" />
              </Button>
            ) : (
              <Button type="submit" size="lg" variant={aiPath ? "outline" : "default"} disabled={busy} aria-busy={busy} className="w-full sm:w-auto">
                {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
                {busy ? "Making your plan…" : editing ? "Update my plan" : "Make my plan"}
              </Button>
            )}
          </div>
        </div>
        {!editing && (
          <p className="mt-4 flex items-center gap-1.5 text-[13px] text-muted-foreground">
            <Lock className="size-3.5 shrink-0" aria-hidden="true" /> Your plan is saved in this browser only. Our server works it out but doesn't keep a copy.
          </p>
        )}
        {editing && hasProgress && (
          <p className="mt-3 text-xs text-muted-foreground">
            <StatusBadge tone="success">Kept</StatusBadge> Your bookings, quotes, money moves and guests stay put, unless you change the event type.
          </p>
        )}
      </form>

      <Dialog open={confirmFresh} onOpenChange={setConfirmFresh}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start this plan over?</DialogTitle>
            <DialogDescription>
              A {values.event_type ? EVENT_LABELS[values.event_type].toLowerCase() : "different event"} has different bookings and budget lines, so your bookings,
              quotes, money moves and guest list for this event will be cleared. Your other events stay as they are.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmFresh(false)}>Keep my plan</Button>
            <Button variant="destructive" onClick={() => submit(true)}>Clear and start over</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
