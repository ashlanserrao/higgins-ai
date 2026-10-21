// Thin wrappers around the backend API.

export class ApiError extends Error {
  constructor(message, fields = []) {
    super(message);
    this.fields = fields;
  }
}

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(path, options);
  } catch {
    throw new ApiError("Can't reach the planner. Check your connection and try again.");
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(body.error || "Something went wrong. Please try again.", body.fields || []);
  }
  return body;
}

const postJson = (path, inputs) =>
  request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(inputs),
  });

export const fetchOptions = () => request("/api/options");

/** Rules-only plan: fast, safe to call on every "what if" change. */
export const requestPlan = (inputs) => postJson("/api/plan", inputs);

/** AI ideas for the same inputs: slow (seconds), fetched after the plan is shown. */
export const requestIdeas = (inputs) => postJson("/api/ideas", inputs);
