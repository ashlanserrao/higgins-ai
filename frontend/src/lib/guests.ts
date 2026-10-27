// The guest list lives only in this browser (see Guest in types.ts).

/** Heads expected: everyone in a party that said yes or maybe. */
export const expectedGuests = (guests: { party: number; rsvp: string }[]) =>
  guests.filter((g) => g.rsvp === "yes" || g.rsvp === "maybe").reduce((sum, g) => sum + g.party, 0);
