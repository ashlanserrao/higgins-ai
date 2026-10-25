// Thin, typed wrappers around the backend API. The rules engine decides every number;
// the frontend only sends inputs and shows what comes back.

import type {
  EventIdeas, FieldError, MessageKind, Options, Plan, PlanDiff, PlanEdit, PlanRequest,
  QuoteDraft, UnderstandResponse,
} from "./types";

export class ApiError extends Error {
  fields: FieldError[];

  constructor(message: string, fields: FieldError[] = []) {
    super(message);
    this.fields = fields;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, init);
  } catch {
    throw new ApiError("Can't reach Higgins right now. Your plan is safe in this browser. Check your connection and try again.");
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(body.error || "That didn't work. Your changes are safe here. Try again?", body.fields || []);
  }
  return body as T;
}

const post = <T>(path: string, body: unknown) =>
  request<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

export const api = {
  options: () => request<Options>("/api/options"),

  /** Rules-only plan: milliseconds, safe to call on every change. */
  plan: (inputs: PlanRequest) => post<{ plan: Plan; ai_available: boolean }>("/api/plan", inputs),

  /** Before/after for a change. Nothing is saved: keep `inputs` if the user confirms. */
  compare: (base: PlanRequest, changes: PlanEdit) =>
    post<{ inputs: PlanRequest; plan: Plan; changes: PlanDiff }>("/api/compare", { base, changes }),

  message: (inputs: PlanRequest, taskId: string, kind: MessageKind, includeBudget: boolean) =>
    post<{ text: string }>("/api/messages", { inputs, task_id: taskId, kind, include_budget: includeBudget }),

  /** AI: seconds, may return null. */
  ideas: (inputs: PlanRequest) => post<{ ideas: EventIdeas | null; ai_available: boolean }>("/api/ideas", inputs),

  /** AI: reads a pasted quote into a draft the organiser must check. */
  extractQuote: (inputs: PlanRequest, text: string) =>
    post<{ quote: QuoteDraft | null; ai_available: boolean }>("/api/quotes/extract", { inputs, text }),

  /** AI: plain language to form values (current = null) or a proposed revision. */
  understand: (message: string, current: PlanRequest | null) =>
    post<UnderstandResponse>("/api/understand", { message, current }),
};
