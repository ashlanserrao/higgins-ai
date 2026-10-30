// Share links: plan inputs in the query, AI ideas compressed in the #fragment.
// The fragment never reaches the server. Free text, progress and guests are never shared.
// The format is unchanged from v1/v2, so old links keep working.

import type { EventIdeas, EventType, PlanRequest, VenueType } from "./types";

const QUERY_FIELDS = [
  "event_type", "event_date", "guests", "budget_inr", "city", "city_tier",
  "venue_type", "venue_includes_catering", "priorities", "households",
] as const;
const IDEA_CATEGORIES = ["themes", "decor", "food", "entertainment"] as const;
const MAX_FRAGMENT_LENGTH = 8000;
const EVENT_TYPES: readonly string[] = ["wedding", "birthday", "community"] satisfies EventType[];
const VENUE_TYPES: readonly string[] = ["venue", "home", "outdoor"] satisfies VenueType[];
const CITY_TIERS: readonly number[] = [1, 2, 3];
// As the server's ideas check: a link's ideas never put a price next to the plan's own numbers.
const PRICES = /₹|\brs\.?\s*\d|\binr\b|\d[\d,]*\s*(?:rupees|lakh|k\b)/i;

export type SharedLink = { inputs: PlanRequest; plannedOn: string };

export const emptyProgress = () => ({ tasks: {}, quotes: [], moves: [] });

export async function buildShareUrl(inputs: PlanRequest, plannedOn: string, ideas: EventIdeas | null) {
  const params = new URLSearchParams();
  for (const field of QUERY_FIELDS) {
    const value = inputs[field];
    if (value === null || value === "" || (Array.isArray(value) && !value.length)) continue;
    params.set(field, Array.isArray(value) ? value.join(",") : typeof value === "boolean" ? String(Number(value)) : String(value));
  }
  params.set("planned_on", plannedOn);
  const base = `${location.origin}${location.pathname}?${params}`;
  return ideas ? `${base}#${await encodeIdeas(ideas)}` : base;
}

/** Plan inputs from the current URL; null if this isn't a shared link, "broken" if it's been
 *  cut short or edited into something no plan has. Dates and amounts are the server's to check. */
export function readSharedInputs(search = location.search): SharedLink | "broken" | null {
  const params = new URLSearchParams(search);
  if (!params.has("event_type")) return null;
  const number = (name: string) => (params.get(name) ? Number(params.get(name)) : null);
  const eventType = params.get("event_type") ?? "";
  const venueType = params.get("venue_type") || "venue";
  const tier = number("city_tier");
  const counts = [number("guests"), number("budget_inr"), number("households")];
  if (!EVENT_TYPES.includes(eventType) || !VENUE_TYPES.includes(venueType) || (tier !== null && !CITY_TIERS.includes(tier)) ||
      counts.some((n) => n !== null && !Number.isSafeInteger(n)))
    return "broken";
  return {
    inputs: {
      event_type: eventType as EventType,
      event_date: params.get("event_date") || "",
      guests: number("guests") ?? 0,
      budget_inr: number("budget_inr") ?? 0,
      city: params.get("city") || "",
      city_tier: tier as PlanRequest["city_tier"],
      venue_type: venueType as VenueType,
      venue_includes_catering: params.get("venue_includes_catering") === "1",
      priorities: (params.get("priorities") || "").split(",").filter(Boolean),
      households: number("households"),
      preferences: "",
      must_haves: "",
      progress: emptyProgress(),
    },
    plannedOn: params.get("planned_on") || "",
  };
}

async function transform(bytes: Uint8Array<ArrayBuffer>, stream: CompressionStream | DecompressionStream) {
  const piped = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(piped).arrayBuffer());
}

const supportsCompression = typeof CompressionStream === "function";

async function encodeIdeas(ideas: EventIdeas) {
  let bytes = new TextEncoder().encode(JSON.stringify(ideas));
  if (supportsCompression) bytes = await transform(bytes, new CompressionStream("deflate-raw"));
  const base64 = btoa(String.fromCharCode(...bytes));
  return (supportsCompression ? "z" : "j") + base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Decode and validate ideas from the URL fragment; null if missing or invalid. */
export async function readSharedIdeas(hash = location.hash): Promise<EventIdeas | null> {
  const fragment = hash.slice(1);
  if (!fragment || fragment.length > MAX_FRAGMENT_LENGTH) return null;
  try {
    const base64 = fragment.slice(1).replace(/-/g, "+").replace(/_/g, "/");
    let bytes = Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0));
    if (fragment[0] === "z") bytes = await transform(bytes, new DecompressionStream("deflate-raw"));
    else if (fragment[0] !== "j") return null;
    const ideas = JSON.parse(new TextDecoder().decode(bytes));
    return isValidIdeas(ideas) ? withoutPrices(ideas) : null;
  } catch {
    return null;
  }
}

const isShortString = (value: unknown, max: number) => typeof value === "string" && value.length <= max;

function isValidIdeas(ideas: unknown): ideas is EventIdeas {
  if (!ideas || typeof ideas !== "object") return false;
  const record = ideas as Record<string, unknown>;
  const listsOk = IDEA_CATEGORIES.every((category) => {
    const list = record[category];
    return Array.isArray(list) && list.length <= 4 &&
      list.every((idea) => isShortString(idea?.title, 80) && isShortString(idea?.detail, 300));
  });
  return listsOk && isShortString(record.triage_advice ?? "", 600);
}

/** Ideas that quote a price are dropped, and so is advice that does; null if a category empties. */
function withoutPrices(ideas: EventIdeas): EventIdeas | null {
  const kept = { ...ideas, triage_advice: PRICES.test(ideas.triage_advice) ? "" : ideas.triage_advice };
  for (const category of IDEA_CATEGORIES) {
    kept[category] = ideas[category].filter((idea) => !PRICES.test(`${idea.title} ${idea.detail}`));
    if (!kept[category].length) return null;
  }
  return kept;
}
