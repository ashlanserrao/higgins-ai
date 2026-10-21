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
  tight: "Tight", modest: "Modest", comfortable: "Comfortable", premium: "Generous",
};
const IDEA_HEADINGS = { themes: "Themes", decor: "Décor", food: "Food & menu", entertainment: "Entertainment" };

export function renderPlan({ plan, ideas, ai_available: aiAvailable }, { plannedOn, checked, onToggle }) {
  const total = plan.budget_lines.reduce((sum, line) => sum + line.amount_inr, 0);
  $("planned-on").textContent = plannedOn ? `Plan created on ${formatDate(plannedOn)}` : "";

  renderSummary(plan, total);
  $("warnings").replaceChildren(...plan.warnings.map((text) => el("li", text)));
  renderBudget(plan, total);
  renderTriage(plan, ideas);
  renderChecklist($("checklist"), plan.checklist, checked, onToggle);
  renderTimeline(plan.timeline);
  renderIdeas(ideas, aiAvailable);
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

function renderTriage(plan, ideas) {
  $("triage-card").hidden = !plan.triage.active;
  if (!plan.triage.active) return;
  const urgent = plan.checklist.filter((item) => item.book_today);
  $("book-today").replaceChildren(...urgent.map((item) =>
    el("li", `${item.label}${item.essential ? " (essential)" : ""}`)));
  $("cuts").replaceChildren(...plan.triage.cut_suggestions.map((text) => el("li", text)));
  $("triage-advice").textContent = ideas?.triage_advice || "";
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

function renderIdeas(ideas, aiAvailable) {
  const container = $("ideas");
  container.replaceChildren();
  $("ideas-button").hidden = Boolean(ideas) || !aiAvailable;
  if (!ideas) {
    $("ideas-note").textContent = aiAvailable
      ? "Want personalised theme, décor and food ideas? Generate them below."
      : "Personalised ideas aren't available right now. Your plan above is complete without them.";
    return;
  }
  $("ideas-note").textContent = "AI-generated suggestions. Check them against your budget.";
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
