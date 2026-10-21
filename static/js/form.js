// The planning form: dynamic fields, reading/filling inputs, and field-level errors.

import { inrShort, todayInIndia } from "./format.js";

const MAX_PRIORITIES = 3;
const MERGED_VENUE_FOOD_LABEL = "Venue & catering";

export class PlanForm {
  constructor(form, priorityOptions) {
    this.form = form;
    this.priorityOptions = priorityOptions;
    this.errorBox = form.querySelector("#form-error");
    form.elements.event_date.min = todayInIndia();
    form.addEventListener("change", (event) => this.onChange(event));
    form.addEventListener("input", (event) => this.onInput(event));
    this.renderPriorities([]);
    this.syncVisibility();
  }

  get eventType() {
    return this.form.elements.event_type.value;
  }

  get cateringMerged() {
    const { elements } = this.form;
    return elements.venue_type.value !== "home" && elements.venue_includes_catering.checked;
  }

  onChange(event) {
    const { name } = event.target;
    this.syncVisibility();
    if (name === "event_type") this.renderPriorities([]);
    if (name === "venue_type" || name === "venue_includes_catering") this.renderPriorities(this.selectedPriorities());
    if (name === "priority") this.limitPriorities();
  }

  selectedPriorities() {
    return [...this.form.querySelectorAll('input[name="priority"]:checked')].map((box) => box.value);
  }

  /**
   * Priorities that match the plan's budget lines: no venue at home, and one
   * "Venue & catering" choice when the venue includes catering.
   */
  availablePriorities() {
    const atHome = this.form.elements.venue_type.value === "home";
    const merged = this.cateringMerged;
    return this.priorityOptions[this.eventType].flatMap((option) => {
      if (option.key === "venue") return atHome || merged ? [] : [option];
      if (option.key === "food" && merged) return [{ key: "food", label: MERGED_VENUE_FOOD_LABEL }];
      return [option];
    });
  }

  onInput(event) {
    const { name, value } = event.target;
    if (name === "budget_inr") {
      this.form.querySelector("#budget_inr-hint").textContent = value >= 1000 ? inrShort(Number(value)) : "";
    }
    if (name === "preferences") {
      this.form.querySelector("#preferences-count").textContent = `${value.length} / 500`;
    }
    if (event.target.getAttribute("aria-invalid")) this.clearFieldError(event.target);
  }

  renderPriorities(selected) {
    // A "venue" pick carries over to the merged venue & catering line.
    const wanted = new Set(selected.map((key) => (key === "venue" && this.cateringMerged ? "food" : key)));
    const container = this.form.querySelector("#priorities");
    container.replaceChildren(...this.availablePriorities().map(({ key, label }) => {
      const wrapper = document.createElement("label");
      const box = Object.assign(document.createElement("input"), {
        type: "checkbox", name: "priority", value: key, checked: wanted.has(key),
      });
      wrapper.append(box, ` ${label}`);
      return wrapper;
    }));
    this.limitPriorities();
  }

  limitPriorities() {
    const boxes = [...this.form.querySelectorAll('input[name="priority"]')];
    const full = boxes.filter((box) => box.checked).length >= MAX_PRIORITIES;
    boxes.forEach((box) => { box.disabled = full && !box.checked; });
  }

  syncVisibility() {
    const { elements } = this.form;
    this.form.querySelector("#households-field").hidden = this.eventType !== "community";
    const atHome = elements.venue_type.value === "home";
    this.form.querySelector("#catering-field").hidden = atHome;
    if (atHome) elements.venue_includes_catering.checked = false;
  }

  /** Read the form as an API request body. */
  read() {
    const { elements } = this.form;
    const optionalNumber = (input) => (input.value ? Number(input.value) : null);
    return {
      event_type: this.eventType,
      event_date: elements.event_date.value,
      guests: Number(elements.guests.value),
      budget_inr: Number(elements.budget_inr.value),
      city: elements.city.value.trim(),
      city_tier: optionalNumber(elements.city_tier),
      venue_type: elements.venue_type.value,
      venue_includes_catering: elements.venue_includes_catering.checked,
      priorities: this.selectedPriorities(),
      households: this.eventType === "community" ? optionalNumber(elements.households) : null,
      preferences: elements.preferences.value.trim(),
    };
  }

  fill(inputs) {
    const { elements } = this.form;
    elements.event_type.value = inputs.event_type;
    for (const name of ["event_date", "guests", "budget_inr", "city", "households", "preferences"]) {
      elements[name].value = inputs[name] ?? "";
    }
    elements.city_tier.value = inputs.city_tier ?? "";
    elements.venue_type.value = inputs.venue_type;
    elements.venue_includes_catering.checked = Boolean(inputs.venue_includes_catering);
    this.renderPriorities(inputs.priorities || []);
    this.syncVisibility();
    elements.budget_inr.dispatchEvent(new Event("input", { bubbles: true }));
    elements.preferences.dispatchEvent(new Event("input", { bubbles: true }));
  }

  /** Keep the form in step with the "what if" sliders. */
  setNumbers(guests, budget) {
    const { elements } = this.form;
    elements.guests.value = guests;
    elements.budget_inr.value = budget;
    elements.budget_inr.dispatchEvent(new Event("input", { bubbles: true }));
  }

  /** Show server validation errors next to their fields; focus the first one. */
  showErrors(message, fields) {
    this.clearErrors();
    this.errorBox.textContent = message;
    this.errorBox.hidden = false;
    let first = null;
    for (const { field, message: text } of fields) {
      const input = this.form.elements[field];
      if (!(input instanceof HTMLElement)) continue;
      const error = Object.assign(document.createElement("p"), {
        id: `${field}-error`, className: "field-error", textContent: text,
      });
      input.closest(".field")?.append(error);
      input.setAttribute("aria-invalid", "true");
      input.setAttribute("aria-describedby", [input.getAttribute("aria-describedby"), error.id].filter(Boolean).join(" "));
      first ??= input;
    }
    (first || this.errorBox).focus?.();
  }

  clearFieldError(input) {
    input.removeAttribute("aria-invalid");
    const errorId = `${input.name}-error`;
    document.getElementById(errorId)?.remove();
    const rest = (input.getAttribute("aria-describedby") || "").split(" ").filter((id) => id && id !== errorId);
    if (rest.length) input.setAttribute("aria-describedby", rest.join(" "));
    else input.removeAttribute("aria-describedby");
  }

  clearErrors() {
    this.errorBox.hidden = true;
    this.form.querySelectorAll("[aria-invalid]").forEach((input) => this.clearFieldError(input));
  }
}
