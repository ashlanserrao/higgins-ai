// "What if?" sliders for guests and budget. Labels update instantly; the plan is
// re-fetched (rules only, no AI) after the user pauses.

import { inrShort } from "./format.js";

const DEBOUNCE_MS = 250;
const MAX_GUESTS = 5000;
const MIN_BUDGET = 1000;
const MAX_BUDGET = 100_000_000;

/** A round slider step: ~1% of the amount, as a power of ten (₹1,50,000 → ₹1,000). */
const niceStep = (amount) => Math.max(100, 10 ** Math.floor(Math.log10(amount) - 2));
const roundTo = (value, step) => Math.round(value / step) * step;

export class WhatIf {
  constructor(onChange) {
    this.onChange = onChange;
    this.guests = document.getElementById("wi-guests");
    this.budget = document.getElementById("wi-budget");
    this.guestsOut = document.getElementById("wi-guests-out");
    this.budgetOut = document.getElementById("wi-budget-out");
    this.resetButton = document.getElementById("wi-reset");
    this.timer = null;
    this.base = null;
    for (const slider of [this.guests, this.budget]) {
      slider.addEventListener("input", () => this.onInput());
    }
    this.resetButton.addEventListener("click", () => this.reset());
  }

  /** Centre the sliders on the organiser's own numbers (from ¼× to 2×). */
  setBase({ guests, budget_inr: budget }) {
    this.base = { guests, budget };
    Object.assign(this.guests, {
      min: Math.max(1, Math.round(guests / 4)), max: Math.min(MAX_GUESTS, Math.max(guests * 2, 10)), step: 1,
    });
    const step = niceStep(budget);
    Object.assign(this.budget, {
      min: Math.max(MIN_BUDGET, roundTo(budget / 4, step)), max: Math.min(MAX_BUDGET, budget * 2), step,
    });
    this.show(guests, budget);
  }

  /** Move the sliders without triggering a plan update (e.g. after a restore). */
  show(guests, budget) {
    this.guests.value = guests;
    this.budget.value = budget;
    this.updateLabels();
  }

  updateLabels() {
    const guests = Number(this.guests.value);
    const budget = Number(this.budget.value);
    this.guestsOut.textContent = `${guests} guests`;
    this.budgetOut.textContent = inrShort(budget);
    this.guests.setAttribute("aria-valuetext", `${guests} guests`);
    this.budget.setAttribute("aria-valuetext", inrShort(budget));
    const changed = this.base && (guests !== this.base.guests || budget !== this.base.budget);
    this.resetButton.hidden = !changed;
  }

  onInput() {
    this.updateLabels();
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.onChange(Number(this.guests.value), Number(this.budget.value)), DEBOUNCE_MS);
  }

  reset() {
    this.show(this.base.guests, this.base.budget);
    clearTimeout(this.timer);
    this.onChange(this.base.guests, this.base.budget);
  }
}
