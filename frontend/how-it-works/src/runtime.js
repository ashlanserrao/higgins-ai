// Live behaviour for the machine. Concatenated after model.mjs (exports stripped) and the
// build's constants (D = page data, ART = markup, CSS = styles) into one ES module.

const TIPS = {
  ticket: () => "The sentence you type, in your own words.",
  hopper: () => "Higgins reads the sentence: the event, the place, the guests and the budget.",
  chute: () => "The budget, split into coins. In this example each coin is about ₹1 lakh.",
  chute1: () => "The coins turn round and run back along the tanks. Each one drops into its tank.",
  tank: (b, plan) => `${b.name}: ${lakh(plan.amounts[b.id])} of the ${lakh(plan.budget)} budget. Example.`,
  drum: (plan) => `The calendar, turned to the date. Example: ${plan.date.month}.`,
  lane: (b, plan) => `${b.name}: book about ${months(plan.leads[b.id])} before the day. Example.`,
  card: () => "The plan: the budget split and the book-by dates, on one card.",
  phone: () => "The plan on your phone, ready to send to family.",
  "lever-guests": () => "+25 guests: adds 25 guests to the example and runs it again.",
  "lever-date": (plan) => `Move the date: tries the example in ${EXAMPLE.dates[(plan.dateIndex + 1) % EXAMPLE.dates.length].month} instead.`,
  reset: () => "Reset: goes back to the first example.",
};

const TAU = Math.PI * 2;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const ease = (x) => { const t = clamp01(x); return t * t * (3 - 2 * t); };
const easeIn = (x) => { const t = clamp01(x); return t * t; };
const easeOut = (x) => { const t = clamp01(x); return 1 - (1 - t) * (1 - t); };
const lerp = (a, b, t) => a + (b - a) * t;
const f1 = (v) => Math.round(v * 10) / 10;

export function mount(root, host) {
  const P = D.P;
  const RAD = Math.PI / 180;
  const sa = Math.sin((P.azimuth ?? 45) * RAD), ca = Math.cos((P.azimuth ?? 45) * RAD);
  const se = Math.sin((P.elevation ?? 30) * RAD), ce = Math.cos((P.elevation ?? 30) * RAD);
  const K = P.scale * Math.sqrt(1.6);
  const iso = ([x, y, z]) => [P.origin[0] + (x * sa - y * ca) * K, P.origin[1] + ((x * ca + y * sa) * se - z * ce) * K];
  const shift = ([x, y, z]) => [(x * sa - y * ca) * K, ((x * ca + y * sa) * se - z * ce) * K];
  const move = (el, d) => { const [dx, dy] = shift(d); el.setAttribute("transform", `translate(${f1(dx)} ${f1(dy)})`); };
  const V = [ca * ce, sa * ce, se];

  root.innerHTML = `<style>${CSS}</style>${ART}`;
  const svg = root.querySelector("svg.hm-live");
  for (const node of root.querySelectorAll("[data-coin]")) node.innerHTML = D.coinSvg;
  const $ = (s) => root.querySelector(s);
  const $$ = (s) => [...root.querySelectorAll(s)];
  const el = {
    ticket: $('[data-part="ticket"]'),
    lines: $$("[data-ticket]"),
    coinSets: [0, 1].map((seg) => $$(`[data-coin][data-seg="${seg}"]`)).filter((list) => list.length),
    levels: $$("[data-level]"),
    surfaces: $$("[data-surface]"),
    ribs: $$("[data-rib]"),
    ticks: $('[data-part="drum-ticks"]'),
    month: $('[data-part="month"]'),
    tags: BUCKETS.map((b) => $(`[data-tag="${b.id}"]`)),
    card: $('[data-part="card"]'),
    bars: $$("[data-bar]"),
    screen: $('[data-part="screen-on"]'),
    rows: $$("[data-row]"),
    phoneTitle: $('[data-part="phone-title"]'),
    phoneSub: $('[data-part="phone-sub"]'),
    phoneBook: $('[data-part="phone-book"]'),
    levers: D.levers.map((lv) => {
      const g = $(`[data-lever="${lv.id}"]`);
      return { ...lv, g, rods: [...g.querySelectorAll(".hm-rod")], knob: g.querySelector("[data-knob]"), angle: lv.rest, pullAt: -9 };
    }),
    resetCap: $('[data-part="reset-cap"]'),
    readout: $("[data-readout]"),
    live: $("[data-live]"),
    legend: $("[data-legend]"),
    tip: $(".hm-tip"),
    hits: $$(".hm-hit"),
  };
  const still = matchMedia("(prefers-reduced-motion: reduce)");

  // ---------------- model state ----------------
  let state = initial();
  let plan = withIndex(planOf(state), state);
  function withIndex(p, s) { return { ...p, dateIndex: s.date }; }

  // What is on screen right now, and what the current run is moving toward.
  const view = {
    ticketZ: D.ticket.held,
    level: BUCKETS.map(() => 0),
    drum: drumAngle(plan.date) + TAU / 3,
    tagX: BUCKETS.map(() => D.tag.inX),
    tagZ: BUCKETS.map(() => 0),
    cardX: D.card.inX,
    screen: 0,
  };
  let run = null;      // { t, first, from, to, changed, times }
  let queued = false;
  let clock = 0;

  function drumAngle(date) {
    const m = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].indexOf(date.short);
    return Math.PI / 2 - (m / 12) * TAU;
  }
  const tagTarget = (p, i) => D.dayX - p.leads[BUCKETS[i].id] * D.perMonth;

  function startRun(first) {
    const to = plan;
    const changed = BUCKETS.map((_, i) => Math.abs(view.tagX[i] - tagTarget(to, i)) > 0.01);
    const order = changed.map((c, i) => (c ? i : -1)).filter((i) => i >= 0);
    const E = first ? 0 : 0.75;
    const C0 = E + 0.8;
    const coinsEnd = C0 + (D.coinCount - 1) * 0.085 + Math.max(...D.route.gateT) + 0.2;
    const T_DRUM = C0 + Math.max(...R.gateT) + 0.15;
    const T_TAG = T_DRUM + 0.9;
    const T_CARD = Math.max(coinsEnd, T_TAG + order.length * 0.22 + 0.9);
    run = {
      t: 0, first, to, changed, order,
      from: { ticketZ: view.ticketZ, level: [...view.level], drum: view.drum, tagX: [...view.tagX], cardX: view.cardX, screen: view.screen },
      E, C0, T_DRUM, T_TAG, T_CARD, END: T_CARD + 1.5,
      textSwapped: first,
      coinValue: to.coins.drops.map((b) => to.amounts[BUCKETS[b].id] / to.coins.counts[b]),
    };
    host.setAttribute("data-running", "");
    say("Reading the sentence");
    kick();
  }

  // Coins follow the route the build worked out (rolling at 2/3 g sin(slope)), then fall
  // through their tank's gate.
  const G_UNITS = 2450; // 1 unit is about 4 mm
  const FALL = 0.11;
  const R = D.route;
  const routeAt = (tau) => {
    const f = Math.min(R.pts.length - 1, Math.max(0, tau / R.dt));
    const i = Math.floor(f), j = Math.min(R.pts.length - 1, i + 1), u = f - i;
    const a = R.pts[i], b = R.pts[j];
    return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u, u < 0.5 ? a[3] : b[3]];
  };

  function step(dt) {
    let moving = false;
    if (run) {
      run.t += dt;
      const r = run, t = r.t;
      moving = true;
      // ticket: lift out (re-run), then drop into the hopper
      if (!r.first && t < r.E) view.ticketZ = lerp(r.from.ticketZ, D.ticket.held, ease(t / (r.E - 0.05)));
      else {
        if (!r.textSwapped) { writeTicket(r.to); r.textSwapped = true; }
        const u = (t - r.E) / 0.5;
        const drop = D.ticket.held - (D.ticket.held - D.ticket.rest) * easeIn(u);
        const settle = u > 1 ? Math.sin(clamp01((u - 1) / 0.35) * Math.PI) * 1.2 * (1 - clamp01((u - 1) / 0.35)) : 0;
        view.ticketZ = drop + settle;
      }
      // tanks drain while the ticket lifts, then fill as coins land
      const landed = BUCKETS.map(() => 0);
      const last = el.coinSets.length - 1;
      el.coinSets[0].forEach((_, n) => {
        const b = r.to.coins.drops[n];
        const tau = t - (r.C0 + n * 0.085);
        let seg = -1, at = null;
        if (b !== undefined && tau >= 0) {
          const tg = R.gateT[b];
          if (tau < tg) { at = routeAt(tau); seg = Math.min(last, at[3]); }
          else if (tau < tg + FALL) { const f = tau - tg, p = R.gatePts[b]; at = [p[0], p[1], p[2] - 0.5 * G_UNITS * f * f]; seg = last; }
          else landed[b] += r.coinValue[n];
        }
        el.coinSets.forEach((set, k) => { if (k === seg) { show(set[n]); move(set[n], at); } else hide(set[n]); });
      });
      BUCKETS.forEach((bk, i) => {
        const want = t < r.C0 - 0.05 && !r.first ? 0 : landed[i];
        const target = Math.min(1, want / plan.budget / D.full);
        view.level[i] += (target - view.level[i]) * (1 - Math.exp(-dt / 0.14));
      });
      // drum turns to the month, the month window changes as it passes half way
      const du = ease((t - r.T_DRUM) / 1.3);
      view.drum = lerp(r.from.drum, drumAngle(r.to.date), du);
      if (du > 0.5 && el.month.textContent !== r.to.date.short) el.month.textContent = r.to.date.short;
      // tags: changed ones lift, slide to their new slot and drop in
      r.order.forEach((i, j) => {
        const u = t - (r.T_TAG + j * 0.22);
        const target = tagTarget(r.to, i);
        if (u <= 0) return;
        view.tagZ[i] = D.tag.lift * (u < 0.15 ? ease(u / 0.15) : u < 0.95 ? 1 : 1 - easeIn((u - 0.95) / 0.15));
        view.tagX[i] = lerp(r.from.tagX[i], target, ease((u - 0.15) / 0.8));
        if (u > 1.1) { view.tagZ[i] = 0; view.tagX[i] = target; }
      });
      // card retracts (re-run), comes back out; the phone screen follows
      if (!r.first && t < r.E) {
        view.cardX = lerp(r.from.cardX, D.card.inX, ease(t / r.E));
        view.screen = r.from.screen * (1 - ease(t / (r.E * 0.6)));
      } else {
        const u = (t - r.T_CARD) / 1.0;
        if (u > 0 && el.bars[0].dataset.for !== String(run.to.guests) + run.to.date.short) writeCard(r.to);
        view.cardX = lerp(D.card.inX, D.card.outX, easeOut(u));
        if (u > 0.75) writePhone(r.to);
        view.screen = ease((u - 0.75) / 0.5);
      }
      if (t > r.C0 && t < r.T_DRUM + 0.2) say("Splitting the budget");
      else if (t >= r.T_DRUM + 0.2 && t < r.T_CARD) say("Setting book-by dates");
      else if (t >= r.T_CARD && t < r.END - 0.4) say("Making the plan");
      if (t > r.END - 0.3) host.removeAttribute("data-running");
      if (t >= r.END) finish();
    }
    // levers swing out and spring back
    for (const lv of el.levers) {
      const age = clock - lv.pullAt;
      const pull = age < 0 ? 0 : age < 0.18 ? ease(age / 0.18) : age < 0.3 ? 1 : 1 - ease((age - 0.3) / 0.5);
      const angle = lv.rest + (lv.pulled - lv.rest) * (still.matches ? 0 : pull);
      if (angle !== lv.angle || !lv.drawn) { lv.angle = angle; drawLever(lv); lv.drawn = true; }
      if (age >= 0 && age < 0.85) moving = true;
    }
    draw();
    return moving;
  }

  function finish() {
    const to = run.to;
    run = null;
    host.removeAttribute("data-running");
    settleOn(to);
    describeNow();
    if (queued) { queued = false; plan = withIndex(planOf(state), state); startRun(false); }
  }

  // The finished state for a plan, with no motion.
  function settleOn(p) {
    writeTicket(p);
    view.ticketZ = D.ticket.rest;
    view.level = BUCKETS.map((b) => Math.min(1, p.amounts[b.id] / p.budget / D.full));
    view.drum = drumAngle(p.date);
    el.month.textContent = p.date.short;
    view.tagX = BUCKETS.map((_, i) => tagTarget(p, i));
    view.tagZ = BUCKETS.map(() => 0);
    view.cardX = D.card.outX;
    writeCard(p);
    writePhone(p);
    view.screen = 1;
    el.coinSets.flat().forEach(hide);
    say(idleReadout(p));
    draw();
  }

  const hide = (n) => { if (n.style.display !== "none") n.style.display = "none"; };
  const show = (n) => { if (n.style.display === "none") n.style.display = ""; };

  // ---------------- drawing ----------------
  const last = {};
  const setOnce = (key, node, attr, value) => { if (last[key] !== value) { last[key] = value; node.setAttribute(attr, value); } };
  function draw() {
    const tz = f1(view.ticketZ - D.ticket.held);
    if (last.tz !== tz) { last.tz = tz; move(el.ticket, [0, 0, tz]); }
    el.levels.forEach((rect, i) => {
      const h = f1(view.level[i] * D.tankH);
      if (last["lv" + i] === h) return;
      last["lv" + i] = h;
      rect.setAttribute("y", f1(D.tankH - h));
      rect.setAttribute("height", h);
      el.surfaces[i].setAttribute("d", `M0 ${f1(D.tankH - h)}H${D.tankW}`);
      el.surfaces[i].style.opacity = h > 0.3 ? "1" : "0";
    });
    const dk = f1(view.drum * 1000);
    if (last.drum !== dk) { last.drum = dk; drawDrum(view.drum); }
    el.tags.forEach((node, i) => {
      const key = f1(view.tagX[i]) + "," + f1(view.tagZ[i]);
      if (last["tag" + i] !== key) { last["tag" + i] = key; move(node, [view.tagX[i], 0, view.tagZ[i]]); }
    });
    const cx = f1(view.cardX - D.card.inX);
    if (last.card !== cx) { last.card = cx; move(el.card, (D.card.axis ?? [1, 0, 0]).map((c) => c * cx)); }
    setOnce("screen", el.screen, "opacity", String(f1(view.screen)));
  }

  function drawDrum(phase) {
    const d = D.drum, c = d.c;
    const pt = (s, r, a) => iso([c[0] + Math.cos(a) * r, s, c[2] + Math.sin(a) * r]);
    let ticks = "";
    for (let i = 0; i < 48; i++) {
      const a = phase + (i / 48) * TAU;
      const p0 = pt(d.s1, i % 4 === 0 ? 14 : 16.6, a), p1 = pt(d.s1, 19.4, a);
      ticks += `M${f1(p0[0])} ${f1(p0[1])}L${f1(p1[0])} ${f1(p1[1])}`;
    }
    el.ticks.setAttribute("d", ticks);
    el.ribs.forEach((rib, i) => {
      const a = phase + (i / 12) * TAU;
      const facing = V[0] * Math.cos(a) + V[2] * Math.sin(a);
      const alpha = ease((facing - 0.1) / 0.45);
      if (alpha < 0.02) { rib.setAttribute("d", ""); return; }
      const p0 = pt(d.s0, d.r, a), p1 = pt(d.sEnd, d.r, a);
      rib.setAttribute("d", `M${f1(p0[0])} ${f1(p0[1])}L${f1(p1[0])} ${f1(p1[1])}`);
      rib.style.opacity = f1(alpha);
    });
  }

  function drawLever(lv) {
    const a = lv.angle * RAD;
    const p0 = iso(lv.pivot);
    const tip = [lv.pivot[0], lv.pivot[1] + Math.sin(a) * lv.arm, lv.pivot[2] + Math.cos(a) * lv.arm];
    const p1 = iso(tip);
    const d = `M${f1(p0[0])} ${f1(p0[1])}L${f1(p1[0])} ${f1(p1[1])}`;
    lv.rods[0].setAttribute("d", d);
    lv.rods[1].setAttribute("d", d);
    const off = 0.55 * K;
    lv.rods[2].setAttribute("d", `M${f1(p0[0] - off)} ${f1(p0[1] - off * 0.3)}L${f1(p1[0] - off)} ${f1(p1[1] - off * 0.3)}`);
    move(lv.knob, tip);
  }

  // ---------------- words ----------------
  function writeTicket(p) {
    el.lines[0].textContent = `${EXAMPLE.event} for ${p.guests}`;
    el.lines[1].textContent = `in ${EXAMPLE.city}, about`;
    el.lines[2].textContent = `₹${p.budget} lakh`;
  }
  function writeCard(p) {
    el.bars.forEach((bar, i) => bar.setAttribute("width", f1(Math.max(0.6, (p.amounts[BUCKETS[i].id] / p.budget) * 40))));
    el.bars[0].dataset.for = String(p.guests) + p.date.short;
  }
  function writePhone(p) {
    if (el.phoneSub.dataset.for === String(p.guests) + p.date.short) return;
    el.phoneSub.dataset.for = String(p.guests) + p.date.short;
    el.phoneTitle.textContent = `${EXAMPLE.event}, ${EXAMPLE.city}`;
    el.phoneSub.textContent = `${p.guests} guests · ${p.date.month}`;
    el.rows.forEach((row, i) => (row.textContent = lakh(p.amounts[BUCKETS[i].id])));
    el.phoneBook.textContent = `${months(p.leads.venue)} ahead`;
  }
  const idleReadout = (p) => `Example · ${p.guests} guests · ${p.date.month} · ${lakh(p.budget)}`;
  function say(text) { if (el.readout.textContent !== text) el.readout.textContent = text; }
  function describeNow() {
    const text = describe(plan);
    el.legend.innerHTML = `<span><b>Example split</b> ${BUCKETS.map((b) => `${b.name} ${lakh(plan.amounts[b.id])}`).join(" · ")}</span><span><b>Example book-by</b> ${BUCKETS.map((b) => `${b.name} ${months(plan.leads[b.id])} before`).join(" · ")}</span>`;
    if (announce) el.live.textContent = text;
    refreshTip();
  }
  let announce = false;

  // ---------------- input ----------------
  function act(id) {
    hideTip(true);
    announce = true;
    if (id === "reset") {
      if (el.resetCap) { el.resetCap.style.transition = "transform .12s"; move(el.resetCap, [0, -1.6, 0]); setTimeout(() => el.resetCap.removeAttribute("transform"), 160); }
      state = initial();
    } else {
      const lv = el.levers.find((l) => l.id === id);
      lv.pullAt = clock;
      state = id === "guests" ? addGuests(state) : moveDate(state);
    }
    el.live.textContent = id === "reset" ? "Back to the first example. Running it again." : `${id === "guests" ? `Now ${state.guests} guests` : `Now in ${EXAMPLE.dates[state.date].month}`}. Running the example again.`;
    if (still.matches) { plan = withIndex(planOf(state), state); settleOn(plan); describeNow(); kick(); return; }
    if (run) { queued = true; say(`Next: ${state.guests} guests · ${EXAMPLE.dates[state.date].month}`); kick(); return; }
    plan = withIndex(planOf(state), state);
    setTimeout(() => { if (!run) startRun(false); }, 180);
    kick();
  }

  // Tooltips on hover and focus
  const hits = el.hits;
  const tipText = (id) => {
    const p = plan;
    if (id.startsWith("tank-")) return TIPS.tank(BUCKETS.find((b) => "tank-" + b.id === id), p);
    if (id.startsWith("lane-")) return TIPS.lane(BUCKETS.find((b) => "lane-" + b.id === id), p);
    return TIPS[id](p);
  };
  let tipFor = null;
  function showTip(node) {
    tipFor = node;
    const id = node.dataset.hit;
    el.tip.textContent = tipText(id);
    node.setAttribute("aria-label", tipText(id));
    const box = node.getBBox();
    const vb = svg.viewBox.baseVal;
    const r = svg.getBoundingClientRect(), s = root.querySelector(".hm-stage").getBoundingClientRect();
    const k = r.width / vb.width;
    const x = r.left - s.left + (box.x + box.width / 2) * k;
    const y = r.top - s.top + box.y * k;
    el.tip.style.left = `${Math.max(140, Math.min(s.width - 140, x))}px`;
    el.tip.style.top = `${Math.max(48, y)}px`;
    el.tip.setAttribute("data-show", "");
  }
  function hideTip(force) { if (force || tipFor) { tipFor = null; el.tip.removeAttribute("data-show"); } }
  function refreshTip() { hits.forEach((n) => n.setAttribute("aria-label", tipText(n.dataset.hit))); if (tipFor) showTip(tipFor); }
  const parts = hits.filter((n) => !n.dataset.button);
  hits.forEach((node) => {
    node.addEventListener("pointerenter", () => { showTip(node); node.setAttribute("data-focus", ""); });
    node.addEventListener("pointerleave", () => { if ((root.activeElement ?? document.activeElement) !== node) hideTip(); node.removeAttribute("data-focus"); });
    node.addEventListener("focus", () => showTip(node));
    node.addEventListener("blur", () => hideTip());
    if (node.dataset.button) {
      node.addEventListener("click", () => act(node.dataset.button));
      node.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); act(node.dataset.button); } else if (e.key === "Escape") hideTip(true); });
    } else {
      node.addEventListener("keydown", (e) => {
        const i = parts.indexOf(node);
        let j = null;
        if (e.key === "ArrowRight" || e.key === "ArrowDown") j = (i + 1) % parts.length;
        if (e.key === "ArrowLeft" || e.key === "ArrowUp") j = (i - 1 + parts.length) % parts.length;
        if (e.key === "Home") j = 0;
        if (e.key === "End") j = parts.length - 1;
        if (e.key === "Escape") { hideTip(true); return; }
        if (j === null) return;
        e.preventDefault();
        node.tabIndex = -1; parts[j].tabIndex = 0; parts[j].focus();
      });
    }
  });

  // ---------------- loop ----------------
  let frame = 0, lastT = 0, visible = false, started = false;
  const tick = (now) => {
    const dt = lastT ? Math.min((now - lastT) / 1000, 1 / 30) : 1 / 60;
    lastT = now;
    clock += dt;
    const moving = step(dt);
    frame = visible && !document.hidden && moving ? requestAnimationFrame(tick) : 0;
    if (!frame) lastT = 0;
  };
  function kick() { if (!frame && visible && !document.hidden) { lastT = 0; frame = requestAnimationFrame(tick); } }
  function begin() {
    if (started) return;
    started = true;
    if (still.matches) { settleOn(plan); describeNow(); return; }
    setTimeout(() => startRun(true), 500);
  }
  const io = new IntersectionObserver((entries) => {
    visible = entries[entries.length - 1].isIntersecting;
    if (visible) { begin(); kick(); }
  }, { rootMargin: "0px 0px -15% 0px", threshold: 0.2 });
  io.observe(root.querySelector(".hm-stage"));
  const onVis = () => { if (!document.hidden) kick(); };
  document.addEventListener("visibilitychange", onVis);
  still.addEventListener?.("change", () => { if (still.matches && run) { run = null; queued = false; plan = withIndex(planOf(state), state); settleOn(plan); describeNow(); } });

  // first paint: the machine waiting, with the ticket in its clip
  el.levers.forEach(drawLever);
  writeTicket(plan);
  el.month.textContent = "Jan";
  draw();
  describeNow();
  say("Example · waiting for the sentence");
  if (still.matches) { started = true; settleOn(plan); }
  refreshTip();

  return {
    destroy() { io.disconnect(); document.removeEventListener("visibilitychange", onVis); cancelAnimationFrame(frame); },
    finish() { started = true; run = null; queued = false; host.removeAttribute("data-running"); settleOn(plan); describeNow(); },
  };
}
