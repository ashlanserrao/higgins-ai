// Page controller: wires the form, API, rendering, local persistence and sharing.

import { fetchOptions, requestPlan } from "./api.js";
import { PlanForm } from "./form.js";
import { todayInIndia } from "./format.js";
import { renderPlan } from "./render.js";
import { buildShareUrl, readSharedIdeas, readSharedInputs } from "./share.js";

const STORAGE_KEY = "eventPlanner:v1";

// Storage can be blocked (private mode, disabled site data); the app must work without it.
const storage = {
  load() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || null; } catch { return null; }
  },
  save(state) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* not persisted */ }
  },
};

const state = { inputs: null, response: null, plannedOn: null, checked: new Set(), shared: false };
let planForm;

const $ = (id) => document.getElementById(id);
const announce = (message) => { $("status").textContent = message; };

function persist() {
  if (state.shared) return; // viewing someone else's plan must not overwrite your own
  storage.save({
    inputs: state.inputs, response: state.response, plannedOn: state.plannedOn,
    checked: [...state.checked],
  });
}

function show({ focus = true } = {}) {
  renderPlan(state.response, {
    plannedOn: state.plannedOn,
    checked: state.checked,
    onToggle(id, isChecked) {
      if (isChecked) state.checked.add(id); else state.checked.delete(id);
      persist();
    },
  });
  $("share-box").hidden = true;
  const { plan } = state.response;
  announce(`Plan ready: ${plan.days_remaining} days to go${plan.triage.active ? ", with items to book today" : ""}.`);
  if (focus) $("results-title").focus();
}

/** Fetch a fresh plan. Existing ideas are kept unless new ones are requested. */
async function loadPlan(inputs, { includeIdeas, keepIdeas = null }) {
  const response = await requestPlan(inputs, includeIdeas);
  if (!response.ideas && keepIdeas) response.ideas = keepIdeas;
  state.inputs = inputs;
  state.response = response;
}

async function onSubmit(event) {
  event.preventDefault();
  const button = event.submitter;
  button.disabled = true;
  announce("Making your plan…");
  planForm.clearErrors();
  try {
    await loadPlan(planForm.read(), { includeIdeas: true });
    state.plannedOn = todayInIndia();
    state.checked = new Set();
    state.shared = false;
    history.replaceState(null, "", location.pathname);
    persist();
    show();
  } catch (error) {
    planForm.showErrors(error.message, error.fields || []);
    announce(error.message);
  } finally {
    button.disabled = false;
  }
}

async function onGenerateIdeas(event) {
  event.target.disabled = true;
  announce("Generating ideas…");
  try {
    await loadPlan(state.inputs, { includeIdeas: true });
    persist();
    show({ focus: false });
    if (!state.response.ideas) announce("Ideas aren't available right now. Please try again later.");
  } catch (error) {
    announce(error.message);
  } finally {
    event.target.disabled = false;
  }
}

async function onShare() {
  const url = await buildShareUrl(state.inputs, state.plannedOn, state.response.ideas);
  const box = $("share-box");
  const field = $("share-url");
  field.value = url;
  box.hidden = false;
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

async function restore() {
  const shared = readSharedInputs();
  if (shared) {
    state.shared = true;
    state.plannedOn = shared.plannedOn;
    planForm.fill(shared.inputs);
    // Recalculate against today's date; ideas come from the link, not a new AI call.
    await loadPlan(shared.inputs, { includeIdeas: false, keepIdeas: await readSharedIdeas() });
    show({ focus: false });
    return;
  }
  const saved = storage.load();
  if (!saved?.inputs || !saved.response) return;
  Object.assign(state, { plannedOn: saved.plannedOn, checked: new Set(saved.checked || []) });
  planForm.fill(saved.inputs);
  try {
    await loadPlan(saved.inputs, { includeIdeas: false, keepIdeas: saved.response.ideas });
  } catch {
    // Past event or offline: show the last saved plan as it was.
    state.inputs = saved.inputs;
    state.response = saved.response;
  }
  show({ focus: false });
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
  $("plan-form").addEventListener("submit", onSubmit);
  $("ideas-button").addEventListener("click", onGenerateIdeas);
  $("share-button").addEventListener("click", onShare);
  $("print-button").addEventListener("click", () => window.print());
  await restore().catch((error) => announce(error.message));
}

init();
