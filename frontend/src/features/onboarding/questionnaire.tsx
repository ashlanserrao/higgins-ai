// Step-by-step questionnaire, with a plain-language box that fills it in. Used for a new
// plan and for editing one: the same event type keeps bookings, quotes, moves and guests.
// For a new event the box is the main path; the steps are the fallback and the place to check.

import { useEffect, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Cake, Check, Heart, Loader2, Lock, Sparkles, Users, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AiBadge, AiNote, FieldError, StatusBadge } from "@/components/common";
import { api, ApiError } from "@/lib/api";
import { addDays, EVENT_LABELS, shortInr, todayInIndia, VENUE_LABELS } from "@/lib/format";
import { emptyProgress } from "@/lib/share";
import type { EventType, PlanRequest, UnderstandResponse, VenueType } from "@/lib/types";
import { cn } from "@/lib/utils";
import { usePlanner } from "@/state/planner";

interface Values {
  event_type: EventType | ""; // "" until the organiser picks one
  event_date: string;
  guests: string;
  budget_inr: string;
  city: string;
  city_tier: string; // "" = work it out from the city
  venue_type: VenueType;
  venue_includes_catering: boolean;
  priorities: string[];
  households: string;
  must_haves: string;
  preferences: string;
}

const blank: Values = {
  event_type: "", event_date: "", guests: "", budget_inr: "", city: "", city_tier: "",
  venue_type: "venue", venue_includes_catering: false, priorities: [], households: "", must_haves: "", preferences: "",
};

const fromInputs = (inputs: Partial<PlanRequest>, base: Values = blank): Values => ({
  ...base,
  ...Object.fromEntries(
    Object.entries(inputs)
      .filter(([key, value]) => key in blank && value !== null && value !== undefined)
      .map(([key, value]) => [key, typeof value === "number" ? String(value) : value]),
  ),
});

const STEPS = ["Your event", "Place & budget", "What matters"] as const;
const FIELD_STEP: Record<string, number> = {
  event_type: 0, event_date: 0, guests: 0,
  budget_inr: 1, city: 1, city_tier: 1, venue_type: 1, venue_includes_catering: 1, households: 1,
  priorities: 2, must_haves: 2, preferences: 2,
};
const FIELD_NAMES: Record<string, string> = {
  event_type: "event type", event_date: "event date", guests: "number of guests", budget_inr: "budget", city: "city",
};
const EVENT_ICONS: Record<EventType, LucideIcon> = { wedding: Heart, birthday: Cake, community: Users };
const GUEST_PICKS = [50, 100, 200, 300];
// The order AI-read values appear in, so the organiser can watch what was understood.
const FILL_ORDER: (keyof Values)[] = [
  "event_type", "event_date", "guests", "budget_inr", "city", "city_tier", "venue_type", "venue_includes_catering", "households",
];
const TIME_LEFT = ["Takes about a minute", "About 40 seconds left", "Almost done"];
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function ChoiceCards<T extends string>({ legend, name, value, options, onChange, error, flash }: {
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
              value === v ? "border-primary bg-primary-soft font-semibold text-primary-ink" : "border-input hover:bg-surface-soft",
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

function Field({ id, label, error, hint, flash, children }: {
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

/** Plain language → form values. The AI reads; the organiser checks the form and submits. */
function DescribeBox({ active, onFilled, onTyping }: {
  active: boolean; onFilled: (result: UnderstandResponse) => void; onTyping: (typing: boolean) => void;
}) {
  // There's no plan yet, so AI availability comes from this call's own response.
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const empty = !text.trim();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (empty) {
      setNote("Write a line about your event first.");
      document.getElementById("describe")?.focus();
      return;
    }
    setBusy(true);
    setNote("");
    try {
      const result = await api.understand(text, null);
      if (!result.ai_available) setNote("That needs the AI, which isn't set up here. The steps below work just as well.");
      else if (!result.understood) setNote(result.unclear[0] || "I couldn't find event details in that. Try naming the occasion, guests, city, date and budget.");
      else {
        onTyping(false);
        onFilled(result);
      }
    } catch (error) {
      setNote((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Enter sends, Shift+Enter starts a new line.
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  };

  return (
    <form onSubmit={submit} className="rounded-xl bg-ai-soft p-5 shadow-card ring-1 ring-ai-border md:p-7">
      <div className="mb-2 flex items-center justify-between gap-2">
        <Label htmlFor="describe" className="font-display text-lg font-normal">Tell me about it in your own words</Label>
        <AiBadge />
      </div>
      <Textarea
        id="describe" value={text} maxLength={500} rows={3} onKeyDown={onKeyDown}
        onChange={(e) => {
          setText(e.target.value);
          onTyping(Boolean(e.target.value.trim()));
        }}
        placeholder="e.g. Wedding for 300 in Jaipur on 14 Feb 2027, about 25 lakh, the venue does food"
        className="bg-card" aria-describedby="describe-note"
      />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <AiNote>AI fills in the steps below. You check them before planning.</AiNote>
        {/* Focusable even when empty, so it can say why it isn't ready. */}
        <Button
          type="submit" size="lg" variant={empty ? "outline" : active ? "aiSolid" : "ai"} disabled={busy}
          aria-disabled={empty || undefined} aria-describedby={empty ? "describe-reason" : undefined}
          className="w-full aria-disabled:cursor-not-allowed aria-disabled:border-dashed aria-disabled:bg-surface-soft aria-disabled:text-muted-foreground aria-disabled:shadow-none sm:w-auto"
        >
          {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Sparkles aria-hidden="true" />}
          {busy ? "Reading…" : "Fill the form for me"}
        </Button>
        {empty && <span id="describe-reason" className="sr-only">Write a line about your event first.</span>}
      </div>
      <p id="describe-note" aria-live="polite" className="mt-2 text-sm text-muted-foreground">
        {note}
      </p>
    </form>
  );
}

export function Questionnaire({ onDone, onCancel }: { onDone?: () => void; onCancel?: () => void }) {
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
  const [aiPath, setAiPath] = useState(false); // typing in the box: its button is the main one
  const [filling, setFilling] = useState<{ values: Values; keys: (keyof Values)[]; step: number } | null>(null);
  const [flash, setFlash] = useState<keyof Values | null>(null);

  // A new plan previews its event's colours as the type is picked; App sets them otherwise.
  useEffect(() => {
    if (!editing) document.documentElement.dataset.event = values.event_type || "wedding";
  }, [editing, values.event_type]);

  const set = <K extends keyof Values>(key: K, value: Values[K]) => {
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

  const stepErrors = (index: number) => {
    const found: Record<string, string> = {};
    if (index === 0) {
      if (!values.event_type) found.event_type = "Pick what you're planning to continue.";
      if (!values.event_date) found.event_date = "Please pick the event date.";
      if (!/^\d+$/.test(values.guests.trim()) || Number(values.guests) < 1) found.guests = "Enter a number of guests, like 150.";
    }
    if (index === 1) {
      if (!values.budget_inr) found.budget_inr = "Please enter the budget.";
      if (values.city.trim().length < 2) found.city = "Please enter the city.";
    }
    return found;
  };

  const next = () => {
    const found = stepErrors(step);
    setErrors(found);
    if (!Object.keys(found).length) setStep((s) => s + 1);
  };

  const request = (fresh: boolean): PlanRequest => ({
    event_type: values.event_type as EventType, // checked on the first step
    event_date: values.event_date,
    guests: Number(values.guests),
    budget_inr: Number(values.budget_inr),
    city: values.city.trim(),
    city_tier: values.city_tier ? (Number(values.city_tier) as 1 | 2 | 3) : null,
    venue_type: values.venue_type,
    venue_includes_catering: values.venue_type === "venue" && values.venue_includes_catering,
    priorities: values.priorities.filter((p) => priorities.some((o) => o.key === p)),
    households: values.event_type === "community" && values.households ? Number(values.households) : null,
    must_haves: values.must_haves.trim(),
    preferences: values.preferences.trim(),
    progress: !fresh && current ? current.progress : emptyProgress(),
  });

  const hasProgress = Boolean(current && (Object.keys(current.progress.tasks).length || current.progress.quotes.length ||
    current.progress.moves.length || guests.length));

  const submit = async (fresh: boolean) => {
    setConfirmFresh(false);
    setBusy(true);
    setFormError("");
    try {
      await makePlan(request(fresh), { fresh, guests: fresh ? [] : undefined });
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

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      {!editing && (
        <>
          <DescribeBox active={aiPath} onFilled={onFilled} onTyping={setAiPath} />
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
                  index <= step ? "border-primary text-foreground" : "border-surface-soft text-muted-foreground",
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

        {step === 0 && (
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
        )}

        {step === 1 && (
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="budget_inr" label="Total budget (₹)" error={err("budget_inr")} flash={flash === "budget_inr"} hint={values.budget_inr ? shortInr(Number(values.budget_inr)) : "Your all-in budget, in rupees"}>
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
        )}

        {step === 2 && (
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
        )}

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
