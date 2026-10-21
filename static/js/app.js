// Page controller: wires the form, API, rendering, local persistence and sharing.
// The rules-based plan is shown immediately; AI ideas load afterwards in the background.

import { fetchOptions, requestIdeas, requestPlan } from "./api.js";
import { PlanForm } from "./form.js";
import { inr, todayInIndia } from "./format.js";
import { renderIdeas, renderPlan } from "./render.js";
import { buildShareUrl, readSharedIdeas, readSharedInputs } from "./share.js";
import { WhatIf } from "./whatif.js";

const STORAGE_KEY = "eventPlanner:v2";

// Storage can be blocked (private mode, disabled site data); the app must work without it.
const storage = {
  load() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || null; } catch { return null; }
  },
  save(value) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(value)); } catch { /* not persisted */ }
  },
};

const state = {
  inputs: null,
  plan: null,
  aiAvailable: false,
  ideas: null,
  ideasFor: null, // the inputs the current ideas were generated for
  ideasStatus: "idle",
  ideasError: "",
  plannedOn: null,
  checked: new Set(),
  shared: false,
};
// Each request gets a number, so a slow, outdated response never overwrites a newer one.
const latest = { plan: 0, ideas: 0 };
let planForm;
let whatIf;

const $ = (id) => document.getElementById(id);
const announce = (message) => { $("status").textContent = message; };
const inputsKey = (inputs) => JSON.stringify(inputs);

function persist() {
  if (state.shared) return; // viewing someone else's plan must not overwrite your own
  const { inputs, plan, aiAvailable, ideas, ideasFor, plannedOn } = state;
  storage.save({ inputs, plan, aiAvailable, ideas, ideasFor, plannedOn, checked: [...state.checked] });
}

/** Ideas are "stale" when the what-if sliders changed the numbers they were made for. */
function settleIdeasStatus() {
  if (["loading", "failed"].includes(state.ideasStatus)) return; // set by loadIdeas
  if (state.ideas) {
    state.ideasStatus = state.ideasFor === inputsKey(state.inputs) ? "ready" : "stale";
  } else {
    state.ideasStatus = state.aiAvailable ? "idle" : "unavailable";
  }
}

function showPlan() {
  renderPlan(state.plan, {
    plannedOn: state.plannedOn,
    checked: state.checked,
    onToggle(id, isChecked) {
      if (isChecked) state.checked.add(id); else state.checked.delete(id);
      persist();
    },
  });
  $("share-box").hidden = true;
}

function showIdeas() {
  settleIdeasStatus();
  renderIdeas({ ideas: state.ideas, status: state.ideasStatus, error: state.ideasError });
}

async function loadPlan(inputs) {
  const ticket = ++latest.plan;
  const response = await requestPlan(inputs);
  if (ticket !== latest.plan) return false;
  state.inputs = inputs;
  state.plan = response.plan;
  state.aiAvailable = response.ai_available;
  return true;
}

async function loadIdeas() {
  const ticket = ++latest.ideas;
  const inputs = state.inputs;
  Object.assign(state, { ideasStatus: "loading", ideasError: "" });
  showIdeas();
  try {
    const response = await requestIdeas(inputs);
    if (ticket !== latest.ideas) return;
    // "ready" may still settle to "stale" if the sliders moved while ideas were loading.
    state.ideasStatus = response.ideas ? "ready" : "failed";
    if (response.ideas) Object.assign(state, { ideas: response.ideas, ideasFor: inputsKey(inputs) });
    announce(response.ideas ? "Your ideas are ready." : "We couldn't generate ideas this time.");
  } catch (error) {
    if (ticket !== latest.ideas) return;
    Object.assign(state, { ideasStatus: "failed", ideasError: error.message });
    announce(error.message);
  }
  persist();
  showIdeas();
}

/** Errors outside the form (e.g. an expired share link) must be visible, not just announced. */
function showPageError(error) {
  planForm.showErrors(error.message, error.fields || []);
  announce(error.message);
}

function setBusy(button, busy, label) {
  button.disabled = busy;
  button.setAttribute("aria-busy", String(busy));
  button.querySelector(".label").textContent = label;
}

async function onSubmit(event) {
  event.preventDefault();
  const button = event.submitter || $("submit-button");
  setBusy(button, true, "Making your plan…");
  announce("Making your plan…");
  planForm.clearErrors();
  try {
    if (!(await loadPlan(planForm.read()))) return;
    Object.assign(state, {
      plannedOn: todayInIndia(), checked: new Set(), shared: false,
      ideas: null, ideasFor: null, ideasStatus: "idle", ideasError: "",
    });
    history.replaceState(null, "", location.pathname);
    whatIf.setBase(state.inputs);
    persist();
    showPlan();
    showIdeas();
    const { plan } = state;
    announce(`Plan ready: ${plan.days_remaining} days to go${plan.triage.active ? ", with items to book today" : ""}.`);
    $("results-title").focus();
    if (state.aiAvailable) loadIdeas();
  } catch (error) {
    showPageError(error);
  } finally {
    setBusy(button, false, "Make my plan");
  }
}

async function onWhatIf(guests, budget) {
  const inputs = { ...state.inputs, guests, budget_inr: budget };
  try {
    if (!(await loadPlan(inputs))) return;
  } catch (error) {
    $("wi-note").textContent = error.message;
    return;
  }
  $("wi-note").textContent = "";
  planForm.setNumbers(guests, budget);
  persist();
  showPlan();
  showIdeas();
  const { plan } = state;
  announce(`${inr(plan.per_guest_inr)} per guest, budget ${plan.budget_status === "tight" ? "tight" : "OK"}.`);
}

async function onShare() {
  const ideas = state.ideasStatus === "ready" ? state.ideas : null;
  const url = await buildShareUrl(state.inputs, state.plannedOn, ideas);
  const field = $("share-url");
  field.value = url;
  $("share-box").hidden = false;
  try {
    if (navigator.share) {
      await navigator.share({ title: "Our event plan", url });
      return;
    }
    await navigator.clipboard.writeText(url);
    announce("Link copied. Paste it into WhatsApp or email.");
  } catch {
    field.focus();
    field.select();
    announce("Copy the link from the box below.");
  }
}

async function restoreShared(shared) {
  state.shared = true;
  state.plannedOn = shared.plannedOn;
  planForm.fill(shared.inputs);
  try {
    // Recalculate against today's date; ideas come from the link, not a new AI call.
    await loadPlan(shared.inputs);
  } catch (error) {
    error.message = `This shared plan can't be shown: ${error.message} Change the details below to make a new plan.`;
    showPageError(error);
    return;
  }
  const ideas = await readSharedIdeas();
  Object.assign(state, { ideas, ideasFor: ideas ? inputsKey(state.inputs) : null });
  whatIf.setBase(state.inputs);
  showPlan();
  showIdeas();
}

async function restoreSaved(saved) {
  Object.assign(state, {
    plannedOn: saved.plannedOn, checked: new Set(saved.checked || []),
    ideas: saved.ideas, ideasFor: saved.ideasFor,
  });
  planForm.fill(saved.inputs);
  try {
    await loadPlan(saved.inputs);
  } catch {
    // Past event or offline: show the last saved plan as it was.
    Object.assign(state, { inputs: saved.inputs, plan: saved.plan, aiAvailable: saved.aiAvailable });
  }
  whatIf.setBase(state.inputs);
  showPlan();
  showIdeas();
}

async function init() {
  let options;
  try {
    options = await fetchOptions();
  } catch (error) {
    const box = $("form-error");
    box.textContent = error.message;
    box.hidden = false;
    return;
  }
  planForm = new PlanForm($("plan-form"), options);
  whatIf = new WhatIf(onWhatIf);
  $("plan-form").addEventListener("submit", onSubmit);
  $("ideas-button").addEventListener("click", loadIdeas);
  $("share-button").addEventListener("click", onShare);
  $("print-button").addEventListener("click", () => window.print());

  const shared = readSharedInputs();
  const saved = storage.load();
  try {
    if (shared) await restoreShared(shared);
    else if (saved?.inputs && saved.plan) await restoreSaved(saved);
  } catch (error) {
    showPageError(error);
  }
}

init();
