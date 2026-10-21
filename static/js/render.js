// Render a plan response into the results section. All text goes through textContent,
// so AI or URL-supplied content can never inject markup.

import { formatDate, inr, inrShort } from "./format.js";

const $ = (id) => document.getElementById(id);

function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

const LEVEL_LABELS = {
  tight: "Tight", modest: "Modest", comfortable: "Comfortable", generous: "Generous",
};
const IDEA_HEADINGS = { themes: "Themes", decor: "Décor", food: "Food & menu", entertainment: "Entertainment" };

/** Render the rules-based plan. Ideas are rendered separately, when they arrive. */
export function renderPlan(plan, { plannedOn, checked, onToggle }) {
  const total = plan.budget_lines.reduce((sum, line) => sum + line.amount_inr, 0);
  $("planned-on").textContent = plannedOn ? `Plan created on ${formatDate(plannedOn)}` : "";

  renderSummary(plan, total);
  $("warnings").replaceChildren(...plan.warnings.map((text) => el("li", text)));
  renderBudget(plan, total);
  renderTriage(plan);
  renderChecklist($("checklist"), plan.checklist, checked, onToggle);
  renderTimeline(plan.timeline);
  $("results").hidden = false;
}

function renderSummary(plan, total) {
  const rows = [
    ["Days to go", plan.days_remaining === 0 ? "Today!" : String(plan.days_remaining)],
    ["Total budget", inrShort(total)],
    ["Per guest", inr(plan.per_guest_inr)],
    ["Budget level", LEVEL_LABELS[plan.budget_level]],
  ];
  if (plan.per_flat_inr) rows.push(["Per-flat contribution", inr(plan.per_flat_inr)]);
  $("summary").replaceChildren(...rows.map(([term, value]) => {
    const row = el("div");
    row.append(el("dt", term), el("dd", value));
    return row;
  }));
}

function renderBudget(plan, total) {
  $("budget").replaceChildren(...plan.budget_lines.map((line) => {
    const item = el("li");
    const head = el("div", undefined, "budget-head");
    const name = el("span", line.label);
    if (line.boosted) name.append(el("span", "priority", "tag"));
    head.append(name, el("span", `${inr(line.amount_inr)} · ${line.percent}%`));
    const bar = el("div", undefined, "bar");
    const fill = el("div", undefined, "bar-fill");
    fill.style.width = `${total ? (line.amount_inr / total) * 100 : 0}%`;
    bar.append(fill);
    bar.setAttribute("aria-hidden", "true");
    item.append(head, bar);
    return item;
  }));
  $("swaps").replaceChildren(...plan.cost_saving_swaps.map((text) => el("li", text)));
  $("swaps-block").hidden = !plan.cost_saving_swaps.length;
}

function renderTriage(plan) {
  $("triage-card").hidden = !plan.triage.active;
  if (!plan.triage.active) return;
  const urgent = plan.checklist.filter((item) => item.book_today);
  $("book-today").replaceChildren(...urgent.map((item) =>
    el("li", `${item.label}${item.essential ? " (essential)" : ""}`)));
  $("cuts").replaceChildren(...plan.triage.cut_suggestions.map((text) => el("li", text)));
}

function renderChecklist(list, items, checked, onToggle) {
  list.replaceChildren(...items.map((item) => {
    const row = el("li", undefined, item.book_today ? "urgent" : "");
    const label = el("label");
    const box = Object.assign(document.createElement("input"), {
      type: "checkbox", checked: checked.has(item.id),
    });
    box.addEventListener("change", () => onToggle(item.id, box.checked));
    const when = item.book_today ? "Book today" : `Book by ${formatDate(item.book_by)}`;
    label.append(box, ` ${item.label} `, el("span", when, "when"));
    row.append(label);
    return row;
  }));
}

function renderTimeline(entries) {
  $("timeline").replaceChildren(...entries.map((entry) => {
    const item = el("li", undefined, `timeline-${entry.kind}${entry.overdue ? " overdue" : ""}`);
    const time = el("time", formatDate(entry.date));
    time.dateTime = entry.date;
    item.append(time, el("span", entry.overdue ? `${entry.label} (overdue)` : entry.label));
    return item;
  }));
}

const IDEAS_NOTES = {
  loading: "Generating ideas for your taste and budget…",
  ready: "AI-generated suggestions. Check them against your budget.",
  stale: "These ideas were made for your earlier numbers.",
  failed: "We couldn't generate ideas this time. Your plan above is complete; you can try again.",
  idle: "Want personalised theme, décor and food ideas? Generate them below.",
  unavailable: "Personalised ideas aren't available on this server. Your plan above is complete without them.",
};
const IDEAS_BUTTONS = { stale: "Refresh ideas", failed: "Try again", idle: "Generate ideas" };

/**
 * Render the ideas card for one status: loading, ready, stale, failed, idle or unavailable.
 * The AI's triage advice is shown only while the ideas match the current plan.
 */
export function renderIdeas({ ideas, status, error }) {
  const container = $("ideas");
  const button = $("ideas-button");
  $("ideas-card").setAttribute("aria-busy", String(status === "loading"));
  $("ideas-note").textContent = error || IDEAS_NOTES[status];
  button.hidden = !IDEAS_BUTTONS[status];
  button.textContent = IDEAS_BUTTONS[status] || "";
  $("triage-advice").textContent = status === "ready" ? ideas?.triage_advice || "" : "";

  if (status === "loading") {
    container.replaceChildren(...Array.from({ length: 3 }, () => el("div", undefined, "skeleton")));
    return;
  }
  container.replaceChildren();
  if (!ideas || !["ready", "stale"].includes(status)) return;
  for (const [category, heading] of Object.entries(IDEA_HEADINGS)) {
    const section = el("div", undefined, "idea-group");
    const list = el("ul");
    list.append(...ideas[category].map((idea) => {
      const item = el("li");
      item.append(el("strong", idea.title), el("span", ` ${idea.detail}`));
      return item;
    }));
    section.append(el("h3", heading), list);
    container.append(section);
  }
}
