// Indian formatting for money and dates. Plans count days in India time.

const rupees = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

export const inr = (amount: number) => rupees.format(amount);

/** "+₹1,10,000" / "−₹2,15,000": for changes, where the sign matters. */
export const signedInr = (amount: number) =>
  amount === 0 ? inr(0) : `${amount > 0 ? "+" : "−"}${inr(Math.abs(amount))}`;

/** "₹25L", "₹1.5Cr", "₹85K": short form for badges. */
export function shortInr(amount: number): string {
  const trim = (n: number) => String(Number(n.toFixed(1)));
  if (amount >= 1e7) return `₹${trim(amount / 1e7)}Cr`;
  if (amount >= 1e5) return `₹${trim(amount / 1e5)}L`;
  if (amount >= 1e3) return `₹${trim(amount / 1e3)}K`;
  return inr(amount);
}

const parse = (iso: string) => new Date(`${iso}T00:00:00`);
const dayFormat = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" });
const shortDayFormat = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" });
const weekdayFormat = new Intl.DateTimeFormat("en-IN", { weekday: "long" });

/** "14 Feb 2027" */
export const formatDate = (iso: string) => dayFormat.format(parse(iso));
/** "14 Feb" */
export const formatShortDate = (iso: string) => shortDayFormat.format(parse(iso));
export const weekday = (iso: string) => weekdayFormat.format(parse(iso));

export function todayInIndia(): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

/** "Good evening", by the clock in India. */
/** By the visitor's own clock: morning until noon, afternoon until 5 pm, then evening. */
export function greeting(now = new Date()): string {
  const hour = now.getHours();
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

/** When the greeting next changes (noon, 5 pm or midnight), in milliseconds from `now`. */
export function untilNextGreeting(now = new Date()): number {
  const next = new Date(now);
  const hour = now.getHours();
  next.setHours(hour < 12 ? 12 : hour < 17 ? 17 : 24, 0, 0, 0);
  return next.getTime() - now.getTime();
}

export function addDays(iso: string, days: number): string {
  const date = parse(iso);
  date.setDate(date.getDate() + days);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

export const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

export const EVENT_LABELS = { wedding: "Wedding", birthday: "Birthday", community: "Community event" } as const;
export const VENUE_LABELS = { venue: "Hall or venue", home: "At home", outdoor: "Outdoor" } as const;
export const TIER_LABELS = { 1: "Metro", 2: "Tier-2 city", 3: "Smaller town" } as const;
export const LEVEL_LABELS = { tight: "Tight", modest: "Modest", comfortable: "Comfortable", generous: "Generous" } as const;

/** Whole days from one ISO date to another; negative when `to` comes first. */
export const daysBetween = (from: string, to: string) => Math.round((parse(to).getTime() - parse(from).getTime()) / 86_400_000);

/** Whole days from today (in India) to the date; negative once it has passed. */
export const daysUntil = (iso: string) => Math.round((parse(iso).getTime() - parse(todayInIndia()).getTime()) / 86_400_000);

export function countdown(iso: string): string {
  const days = daysUntil(iso);
  if (days > 1) return `${days} days to go`;
  if (days === 1) return "Tomorrow";
  if (days === 0) return "Today";
  return days === -1 ? "Happened yesterday" : `Happened ${-days} days ago`;
}

/** "mangalore" → "Mangalore", "new delhi" → "New Delhi": for display; stored data keeps its case. */
export const titleCase = (text: string) => text.replace(/(^|[\s-])(\p{L})/gu, (_, gap: string, letter: string) => gap + letter.toUpperCase());

/** The organiser's own name for an event, or "Wedding in Jaipur". */
export const eventName = (event: { name: string; inputs: { event_type: keyof typeof EVENT_LABELS; city: string } }) =>
  event.name.trim() || `${EVENT_LABELS[event.inputs.event_type]} in ${titleCase(event.inputs.city.trim())}`;
