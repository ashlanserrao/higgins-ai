// API types, generated from FastAPI's OpenAPI schema into api-types.ts (README > Project structure).
// Regenerate after changing app/models.py or app/responses.py; never edit api-types.ts by hand.
// Dates travel as ISO strings (YYYY-MM-DD); money is whole rupees.
//
// "-Output" schemas are what the API sends back: every field present. The browser stores and
// resends those, so they are the types the app works with.

import type { components } from "./api-types";

type Schemas = components["schemas"];

export type PlanRequest = Schemas["PlanRequest-Output"];
export type Progress = Schemas["Progress-Output"];
export type Quote = Schemas["Quote-Output"];
export type TaskUpdate = Schemas["TaskUpdate"];
export type Move = Schemas["Move"];
/** Fields /api/compare can change; anything left out stays as it is. */
export type PlanEdit = Schemas["PlanEdit"];

export type Plan = Schemas["Plan"];
export type BudgetLine = Schemas["BudgetLine"];
export type QuoteComparison = Schemas["QuoteComparison"];
export type Rebalance = Schemas["Rebalance"];
export type ChecklistItem = Schemas["ChecklistItem"];
export type TimelineEntry = Schemas["TimelineEntry"];
export type PlanDiff = Schemas["PlanDiff"];

export type Idea = Schemas["Idea"];
export type EventIdeas = Schemas["EventIdeas"];
/** What the AI could read from a pasted quote. Null: the quote didn't say. */
export type QuoteDraft = Schemas["QuoteDraft"];
export type FieldError = Schemas["FieldError"];
/** The API types `inputs` as a plain dict: form values for a new event, the edited request for a revision. */
export type UnderstandResponse = Omit<Schemas["UnderstandResponse"], "inputs"> & { inputs: Partial<PlanRequest> };

export type PlanResponse = Schemas["PlanResponse"];
export type CompareResponse = Schemas["CompareResponse"];
export type MessageResponse = Schemas["MessageResponse"];
export type IdeasResponse = Schemas["IdeasResponse"];
export type QuoteExtractResponse = Schemas["QuoteExtractResponse"];

// Literal unions are inlined in the schema, so they're named here from the field that uses them.
export type EventType = Plan["event_type"];
export type VenueType = PlanRequest["venue_type"];
export type BudgetStatus = Plan["budget_status"];
export type BudgetLevel = Plan["budget_level"];
export type BookingStatus = ChecklistItem["status"];
export type TaskState = TaskUpdate["state"];
export type Capacity = QuoteComparison["capacity"];
export type MessageKind = Schemas["MessageRequest"]["kind"];

// Not described by the API.

/** /api/options: priority choices per event type, built from the rules tables. */
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
