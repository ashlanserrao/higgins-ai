// The questionnaire's form values and the pure rules around them: defaults, which step a
// field is on, per-step checks and the conversion to a PlanRequest.

import type { EventType, Options, PlanRequest, Progress, VenueType } from "@/lib/types";

export interface Values {
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

export type SetValue = <K extends keyof Values>(key: K, value: Values[K]) => void;

/** What every step needs to render its fields and their errors. */
export interface StepProps {
  values: Values;
  set: SetValue;
  err: (name: string) => string | undefined;
  describedBy: (name: string) => string;
  flash: keyof Values | null;
}

export const blank: Values = {
  event_type: "", event_date: "", guests: "", budget_inr: "", city: "", city_tier: "",
  venue_type: "venue", venue_includes_catering: false, priorities: [], households: "", must_haves: "", preferences: "",
};

export const fromInputs = (inputs: Partial<PlanRequest>, base: Values = blank): Values => ({
  ...base,
  ...Object.fromEntries(
    Object.entries(inputs)
      .filter(([key, value]) => key in blank && value !== null && value !== undefined)
      .map(([key, value]) => [key, typeof value === "number" ? String(value) : value]),
  ),
});

export const STEPS = ["Your event", "Place & budget", "What matters"] as const;
export const FIELD_STEP: Record<string, number> = {
  event_type: 0, event_date: 0, guests: 0,
  budget_inr: 1, city: 1, city_tier: 1, venue_type: 1, venue_includes_catering: 1, households: 1,
  priorities: 2, must_haves: 2, preferences: 2,
};
export const FIELD_NAMES: Record<string, string> = {
  event_type: "event type", event_date: "event date", guests: "number of guests", budget_inr: "budget", city: "city",
};
// The order AI-read values appear in, so the organiser can watch what was understood.
export const FILL_ORDER: (keyof Values)[] = [
  "event_type", "event_date", "guests", "budget_inr", "city", "city_tier", "venue_type", "venue_includes_catering", "households",
];
export const TIME_LEFT = ["Takes about a minute", "About 40 seconds left", "Almost done"];

export function stepErrors(values: Values, index: number) {
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
}

/** The form as a plan request. Priorities the event type doesn't offer are dropped. */
export const toPlanRequest = (values: Values, priorities: Options[EventType], progress: Progress): PlanRequest => ({
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
  progress,
});

/** Bookings, quotes, moves or guests that a change of event type would clear. */
export const hasProgress = (current: PlanRequest | null, guestCount: number) =>
  Boolean(current && (Object.keys(current.progress.tasks).length || current.progress.quotes.length ||
    current.progress.moves.length || guestCount));
