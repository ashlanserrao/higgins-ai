// Indian number and date formatting.

const rupees = new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", maximumFractionDigits: 0,
});
const shortDate = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" });

/** 150000 → "₹1,50,000" */
export const inr = (amount) => rupees.format(amount);

/** 1500000 → "₹15 lakh", 25000000 → "₹2.5 crore", smaller amounts in full. */
export function inrShort(amount) {
  const scaled = (value, unit) => `₹${Number(value.toFixed(1))} ${unit}`;
  if (amount >= 1e7) return scaled(amount / 1e7, "crore");
  if (amount >= 1e5) return scaled(amount / 1e5, "lakh");
  return inr(amount);
}

/** Parse "2026-11-08" as a local calendar date (no timezone shift). */
export function parseIsoDate(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/** "2026-11-08" → "8 Nov 2026" */
export const formatDate = (iso) => shortDate.format(parseIsoDate(iso));

/** Today's date in India as "YYYY-MM-DD", matching the server's planning day. */
export function todayInIndia() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}
