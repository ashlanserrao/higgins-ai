// The example the machine acts out. Every number the figure shows comes from here.
// These are illustrative values, not Higgins's real pricing or rules: edit EXAMPLE to change them.

export const EXAMPLE = {
  event: "Wedding",
  city: "Jaipur",
  budget: 25, // lakh
  guests: 300,
  guestStep: 25,
  guestMax: 400, // a pull past this goes back to `guests`
  // The "Move the date" lever toggles between these two months.
  dates: [
    { month: "December", short: "Dec", busy: true },
    { month: "August", short: "Aug", busy: false },
  ],
  // Budget split, in lakh. Other is whatever is left of the budget.
  venueBase: 3.5,
  venuePerGuest: 0.014,
  venueQuietFactor: 0.82, // venues cost less in a quiet month
  foodPerGuest: 0.026,
  decor: 4.5,
  // Book-by lead times, in months before the day.
  leads: {
    venue: { base: 6, busy: 1.5, per25: 0.5 }, // bigger halls and busy months book out sooner
    food: { base: 4, busy: 0, per50: 0.5 },
    decor: { base: 3, busy: 1 },
    other: { base: 2 },
  },
  coinValue: 1, // lakh per coin
  railMonths: 10, // how far back the book-by rail reaches
};

export const BUCKETS = [
  { id: "venue", name: "Venue" },
  { id: "food", name: "Food" },
  { id: "decor", name: "Décor" },
  { id: "other", name: "Other" },
];

const round1 = (value) => Math.round(value * 10) / 10;

export function initial(example = EXAMPLE) {
  return { guests: example.guests, date: 0 };
}

export function addGuests(state, example = EXAMPLE) {
  const next = state.guests + example.guestStep;
  return { ...state, guests: next > example.guestMax ? example.guests : next };
}

export function moveDate(state, example = EXAMPLE) {
  return { ...state, date: (state.date + 1) % example.dates.length };
}

export function sentenceOf(state, example = EXAMPLE) {
  return `${example.event} for ${state.guests} in ${example.city}, about ₹${example.budget} lakh`;
}

export function planOf(state, example = EXAMPLE) {
  const date = example.dates[state.date];
  const g = state.guests;
  const venue = round1((example.venueBase + example.venuePerGuest * g) * (date.busy ? 1 : example.venueQuietFactor));
  const food = round1(example.foodPerGuest * g);
  const decor = round1(example.decor);
  const other = round1(example.budget - venue - food - decor);
  const amounts = { venue, food, decor, other };
  const steps = Math.floor((g - example.guests) / 25);
  const L = example.leads;
  const leads = {
    venue: L.venue.base + (date.busy ? L.venue.busy : 0) + L.venue.per25 * steps,
    food: L.food.base + (date.busy ? L.food.busy : 0) + L.food.per50 * Math.floor((g - example.guests) / 50),
    decor: L.decor.base + (date.busy ? L.decor.busy : 0),
    other: L.other.base,
  };
  const coins = coinsOf(amounts, example);
  return {
    guests: g,
    date,
    sentence: sentenceOf(state, example),
    budget: example.budget,
    amounts,
    shares: Object.fromEntries(BUCKETS.map(({ id }) => [id, amounts[id] / example.budget])),
    leads,
    coins,
  };
}

// Whole coins per bucket that add up to the budget (largest remainder), then an
// interleaved drop order so the chute looks like it is sorting.
function coinsOf(amounts, example) {
  const total = Math.round(example.budget / example.coinValue);
  const raw = BUCKETS.map(({ id }) => Math.max(0, amounts[id] / example.coinValue));
  const counts = raw.map(Math.floor);
  let left = total - counts.reduce((a, b) => a + b, 0);
  const order = raw.map((value, index) => [value - Math.floor(value), index]).sort((a, b) => b[0] - a[0]);
  for (let i = 0; left > 0 && i < order.length; i++, left--) counts[order[i][1]]++;
  const drops = [];
  const given = counts.map(() => 0);
  for (let n = 0; n < total; n++) {
    let best = -1;
    let need = -1;
    counts.forEach((count, index) => {
      const owed = count * ((n + 1) / total) - given[index];
      if (given[index] < count && owed > need) { need = owed; best = index; }
    });
    if (best < 0) break;
    given[best]++;
    drops.push(best);
  }
  return { counts, drops };
}

export const lakh = (value) => `₹${value.toFixed(1).replace(/\.0$/, "")} lakh`;
export const months = (value) => `${String(value).replace(/\.5$/, "½")} months`;

export function describePlan(plan) {
  const split = BUCKETS.map(({ id, name }) => `${name} ${lakh(plan.amounts[id])}`).join(", ");
  const books = BUCKETS.map(({ id, name }) => `${name.toLowerCase()} about ${months(plan.leads[id])} before`).join(", ");
  return `Example: “${plan.sentence}”, in ${plan.date.month}. Budget split: ${split}. Book ${books}.`;
}
