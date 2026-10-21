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

export const fetchOptions = () => request("/api/options");

export const requestPlan = (inputs, includeIdeas) =>
  request("/api/plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...inputs, include_ideas: includeIdeas }),
  });
