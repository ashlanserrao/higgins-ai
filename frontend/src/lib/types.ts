// Mirrors the Pydantic models in app/models.py and the API responses in app/main.py.
// Dates travel as ISO strings (YYYY-MM-DD); money is whole rupees.

export type EventType = "wedding" | "birthday" | "community";
export type VenueType = "venue" | "home" | "outdoor";
export type BudgetStatus = "ok" | "tight";
export type BudgetLevel = "tight" | "modest" | "comfortable" | "generous";
export type BookingStatus = "on_track" | "tight" | "book_today";
export type TaskState = "booked" | "delayed";
export type Capacity = "fits" | "too_small" | "not_stated";
export type MessageKind = "enquiry" | "follow_up" | "confirmation";

export interface TaskUpdate {
  state: TaskState;
  on: string;
}

export interface Quote {
  id: string;
  category: string;
  vendor: string;
  total_inr: number | null;
  per_plate_inr: number | null;
  guests_covered: number | null;
  inclusions: string[];
  exclusions: string[];
  taxes_included: boolean | null;
  valid_until: string | null;
  source: "manual" | "ai_extracted";
  verified: boolean;
  accepted_on: string | null;
}

export interface Move {
  from_key: string;
  to_key: string;
  amount_inr: number;
}

export interface Progress {
  tasks: Record<string, TaskUpdate>;
  quotes: Quote[];
  moves: Move[];
}

export interface PlanRequest {
  event_type: EventType;
  event_date: string;
  guests: number;
  budget_inr: number;
  city: string;
  city_tier: 1 | 2 | 3 | null;
  venue_type: VenueType;
  venue_includes_catering: boolean;
  priorities: string[];
  households: number | null;
  preferences: string;
  must_haves: string;
  progress: Progress;
}

/** Fields /api/compare can change; anything left out stays as it is. */
export type PlanEdit = Partial<
  Pick<
    PlanRequest,
    | "event_date" | "guests" | "budget_inr" | "city" | "city_tier" | "venue_type"
    | "venue_includes_catering" | "priorities" | "households"
  >
> & { moves?: Move[] };

export interface BudgetLine {
  key: string;
  label: string;
  percent: number;
  amount_inr: number;
  estimate_inr: number;
  moved_inr: number;
  boosted: boolean;
  source: "estimate" | "confirmed";
  quote_id: string | null;
  change_inr: number;
}

export interface QuoteComparison {
  quote_id: string;
  vendor: string;
  total_inr: number | null;
  calculated: boolean;
  per_guest_inr: number | null;
  capacity: Capacity;
  vs_estimate_inr: number | null;
  missing: string[];
  accepted: boolean;
  expired: boolean;
}

export interface Rebalance {
  change_inr: number;
  from_contingency_inr: number;
  cuts: { key: string; label: string; amount_inr: number }[];
  over_budget_inr: number;
  explanation: string;
}

export interface ChecklistItem {
  id: string;
  label: string;
  lead_days: number;
  book_by: string;
  status: BookingStatus;
  essential: boolean;
  done: boolean;
  booked_on: string | null;
  expected_on: string | null;
  delayed_by: string | null;
  waiting_on: string[];
  at_risk: boolean;
}

export interface TimelineEntry {
  date: string;
  label: string;
  kind: "booking" | "milestone" | "event";
  status: "on_track" | "tight" | "overdue" | "at_risk" | "done";
}

export interface Plan {
  event_type: EventType;
  event_date: string;
  today: string;
  days_remaining: number;
  city_tier: 1 | 2 | 3;
  per_guest_inr: number;
  floor_per_guest_inr: number;
  budget_status: BudgetStatus;
  budget_level: BudgetLevel;
  budget_lines: BudgetLine[];
  warnings: string[];
  cost_saving_swaps: string[];
  triage: { active: boolean; book_today: string[]; cut_suggestions: string[] };
  timeline: TimelineEntry[];
  checklist: ChecklistItem[];
  per_flat_inr: number | null;
  ignored_progress: string[];
  quote_comparisons: Record<string, QuoteComparison[]>;
  ignored_quotes: string[];
  ignored_moves: number[];
  rebalance: Rebalance | null;
}

export interface Pair<T> {
  before: T;
  after: T;
}

export interface PlanDiff {
  days_remaining: Pair<number>;
  per_guest_inr: Pair<number>;
  budget_status: Pair<BudgetStatus>;
  budget_level: Pair<BudgetLevel>;
  triage_active: Pair<boolean>;
  over_budget_inr: Pair<number>;
  lines: { key: string; label: string; before_inr: number | null; after_inr: number | null; delta_inr: number }[];
  tasks: { id: string; label: string; before: string | null; after: string | null }[];
  warnings_added: string[];
  warnings_removed: string[];
  summary: string[];
}

export interface Idea {
  title: string;
  detail: string;
}

export interface EventIdeas {
  themes: Idea[];
  decor: Idea[];
  food: Idea[];
  entertainment: Idea[];
  triage_advice: string;
}

/** What the AI could read from a pasted quote. Null: the quote didn't say. */
export type QuoteDraft = Omit<Quote, "id" | "source" | "verified" | "accepted_on" | "category"> & {
  category: string | null;
};

export interface FieldError {
  field: string;
  message: string;
}

export interface UnderstandResponse {
  ai_available: boolean;
  understood: boolean;
  inputs: Partial<PlanRequest>;
  fields: { field: string; label: string; before: unknown; after: unknown }[];
  missing: string[];
  unclear: string[];
  errors: FieldError[];
  plan: Plan | null;
  changes: PlanDiff | null;
}

export type Options = Record<EventType, { key: string; label: string }[]>;

export type Rsvp = "invited" | "yes" | "maybe" | "no";

/** Guests never leave the browser: not in API requests, not in share links. */
export interface Guest {
  id: string;
  name: string;
  group: string;
  party: number;
  rsvp: Rsvp;
}
