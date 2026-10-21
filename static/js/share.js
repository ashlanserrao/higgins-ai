// Share links: plan inputs in the query, AI ideas compressed in the #fragment.
// The fragment never reaches the server; free-text preferences are never shared.

const QUERY_FIELDS = [
  "event_type", "event_date", "guests", "budget_inr", "city", "city_tier",
  "venue_type", "venue_includes_catering", "priorities", "households",
];
const IDEA_CATEGORIES = ["themes", "decor", "food", "entertainment"];
const MAX_FRAGMENT_LENGTH = 8000;

export async function buildShareUrl(inputs, plannedOn, ideas) {
  const params = new URLSearchParams();
  for (const field of QUERY_FIELDS) {
    const value = inputs[field];
    if (value === null || value === undefined || value === "" || (Array.isArray(value) && !value.length)) continue;
    params.set(field, Array.isArray(value) ? value.join(",") : typeof value === "boolean" ? Number(value) : value);
  }
  params.set("planned_on", plannedOn);
  const base = `${location.origin}${location.pathname}?${params}`;
  return ideas ? `${base}#${await encodeIdeas(ideas)}` : base;
}

/** Read plan inputs from the current URL, or null if this isn't a shared link. */
export function readSharedInputs(search = location.search) {
  const params = new URLSearchParams(search);
  if (!params.has("event_type")) return null;
  const number = (name) => (params.get(name) ? Number(params.get(name)) : null);
  return {
    inputs: {
      event_type: params.get("event_type"),
      event_date: params.get("event_date"),
      guests: number("guests"),
      budget_inr: number("budget_inr"),
      city: params.get("city") || "",
      city_tier: number("city_tier"),
      venue_type: params.get("venue_type") || "venue",
      venue_includes_catering: params.get("venue_includes_catering") === "1",
      priorities: (params.get("priorities") || "").split(",").filter(Boolean),
      households: number("households"),
      preferences: "",
    },
    plannedOn: params.get("planned_on"),
  };
}

async function transform(bytes, stream) {
  const piped = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(piped).arrayBuffer());
}

const supportsCompression = typeof CompressionStream === "function";

async function encodeIdeas(ideas) {
  let bytes = new TextEncoder().encode(JSON.stringify(ideas));
  if (supportsCompression) bytes = await transform(bytes, new CompressionStream("deflate-raw"));
  const base64 = btoa(String.fromCharCode(...bytes));
  return (supportsCompression ? "z" : "j") + base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Decode and validate ideas from the URL fragment; returns null if missing or invalid. */
export async function readSharedIdeas(hash = location.hash) {
  const fragment = hash.slice(1);
  if (!fragment || fragment.length > MAX_FRAGMENT_LENGTH) return null;
  try {
    const base64 = fragment.slice(1).replace(/-/g, "+").replace(/_/g, "/");
    let bytes = Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0));
    if (fragment[0] === "z") bytes = await transform(bytes, new DecompressionStream("deflate-raw"));
    else if (fragment[0] !== "j") return null;
    const ideas = JSON.parse(new TextDecoder().decode(bytes));
    return isValidIdeas(ideas) ? ideas : null;
  } catch {
    return null;
  }
}

const isShortString = (value, max) => typeof value === "string" && value.length <= max;

function isValidIdeas(ideas) {
  if (!ideas || typeof ideas !== "object") return false;
  const listsOk = IDEA_CATEGORIES.every((category) =>
    Array.isArray(ideas[category]) && ideas[category].length <= 4 &&
    ideas[category].every((idea) => isShortString(idea?.title, 80) && isShortString(idea?.detail, 300)));
  return listsOk && isShortString(ideas.triage_advice ?? "", 600);
}
