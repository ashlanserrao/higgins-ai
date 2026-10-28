// The machine, built from a layout (variant-b.mjs). Every part is drawn
// with the Anatomy kit; the layout only decides where things stand.
import { partsFor, k, G, coinRoute } from "./parts.mjs";
import { BUCKETS } from "./model.mjs";

export function buildMachine(C) {
  const { W, H, AZ, EL, BASE, RB, RB_H, HOP, TK, POST, TANKS, TW, T_TOP, CAP, WIN, FULL, CAB, CAB_H, DRUM, BOARD, BOARD_H, LANES, DAY_X, PER_MONTH, TAG, PRESS, PRESS_H, CARD, PHONE, LEVERS, RESET, PIVOT_Z, ARM } = C;
  const RZ = C.RZ ?? 0; // height the reader stands at
  const TZ = C.TZ ?? 0; // height the tanks stand at
  const TY = C.TY ?? 0; // tank row centre in y
  const FRONT = RB.y + RB.d;
  const HOP_Z = RZ + RB_H;
  const RIM = HOP_Z + 34.5;
  const ID = C.id;
  const P = k.fitProjection(
    [...k.boxCorners(BASE, -17, 0), [POST[0], POST[1], TK.held + TK.h + 14], [TK.x, TK.y, TK.held + TK.h + 14], [PHONE.x + PHONE.w, PHONE.y, PHONE.z1 + 2], ...(C.fit ?? [])],
    W, H, { pad: 26, azimuth: AZ, elevation: EL },
  );
  const X = partsFor(P);
  const { at, S, L, Dt, mat, faceY, faceX, text, rect, halo, slab, cyl, screws, hullPath, box, f1 } = X;
  const KS = G.scaleOf(P);
  // Static art is painted once in the back SVG. Moving parts go in a small live SVG on top,
  // together with copies of the static pieces that must cover them ("both"), so a frame only
  // repaints the live layer.
  const layers = {}, lives = {};
  let cur = (layers.base = []), curLive = (lives.base = []), mode = "static";
  const sec = (name) => { cur = layers[name] ??= []; curLive = lives[name] ??= []; mode = "static"; };
  const live = (...s) => curLive.push(...s);
  const both = (...s) => { cur.push(...s); curLive.push(...s); };
  const push = (...s) => (mode === "both" ? both(...s) : cur.push(...s));
  const defs = [];
  const hits = [];
  const hit = (id, points, extra = {}) => hits.push({ id, d: hullPath(points), ...extra });

  // ---------- base ----------
  push(X.basePlate(BASE, { feet: [[BASE.x + 22, BASE.y + 22], [BASE.x + BASE.w - 22, BASE.y + 22], [BASE.x + 22, BASE.y + BASE.d - 22], [BASE.x + BASE.w - 22, BASE.y + BASE.d - 22], [20, BASE.y + 22], [20, BASE.y + BASE.d - 22]] }));
  if (C.ruler) push(X.ruler(C.ruler, 0, 4, 5));
  if (C.label) push(X.labelPlate(C.label, 0));
  if (C.frame) C.frame(X, push, P);

  // ---------- reader box, hopper, gantry ----------
  sec("reader");
  push(halo(RB, RZ, 6));
  push(slab(k.insetPlan(RB, -2), RZ, 4, { tone: "lo" }, 4, 0.6));
  push(S(k.slabOf(RB, RZ + 4, 56, P, 6, 0), { tone: "mid", inner: L(k.sideSeam(RB, RZ + 34, P, 6), { tone: "faint" }) }));
  push(slab(k.insetPlan(RB, 0.6), RZ + 60, RB_H - 60, { tone: "mid" }, 6, 1));
  push(L(k.planOutline(k.insetPlan(RB, 4), RZ + RB_H, P, 6), { tone: "faint" }));
  push(screws(k.corners(RB, 4).map(([x, y]) => [x, y, RZ + RB_H])));
  // front face: screws, label plates under the levers, lamp
  const frontPlates = [];
  for (const lv of LEVERS) frontPlates.push({ x0: lv.x - lv.plate / 2, w: lv.plate, label: lv.label });
  frontPlates.push({ x0: RESET.x - 8, w: 16, label: "Reset" });
  for (const pl of frontPlates) {
    push(slab({ x: pl.x0, y: FRONT, w: pl.w, d: 0.7, r: 0.4 }, RZ + 12, 9, { tone: "lo" }, 2, 0));
    push(faceY(pl.x0, FRONT + 0.7, RZ + 21, text(pl.w / 2, 6.3, pl.label, { size: 4 })));
  }
  push(screws([[RB.x + 4, FRONT, RZ + 56], [RB.x + RB.w - 4, FRONT, RZ + 56], [RB.x + 4, FRONT, RZ + 8], [RB.x + RB.w - 4, FRONT, RZ + 8]], 0.45));
  // status lamp on the lid's front face
  const LAMP = [RB.x + RB.w - 9, FRONT, RZ + 72];
  push(mat("hm-brass", S(G.disc(0, 1.6, 4.2, G.frameOf([LAMP[0], FRONT - 0.6, LAMP[2]], [0, 1, 0], [1, 0, 0], [0, 0, 1]), P, { steps: 32 }), { tone: "mid" })));
  push(`<path class="hm-lamp" d="${G.circleOf(G.frameOf([LAMP[0], FRONT + 1, LAMP[2]], [0, 1, 0], [1, 0, 0], [0, 0, 1]), 0, 2.8, P, 28)}"/>`);
  push(L(G.circleOf(G.frameOf([LAMP[0], FRONT + 1, LAMP[2]], [0, 1, 0], [1, 0, 0], [0, 0, 1]), 0, 2.8, P, 28), { tone: "mid" }));
  // right face: vents (closed slots)
  const RIGHT0 = RB.x + RB.w;
  push(faceX(RIGHT0, RB.y + RB.d - 8, RZ + 54, [0, 1, 2, 3, 4].map((i) => rect(4 + i * 7.6, 0, 3, 22, "hm-fill hm-cavity", 1.5) + `<rect class="iso-line" data-tone="lo" x="${4 + i * 7.6}" y="0" width="3" height="22" rx="1.5" fill="none"/>`).join(""), ' class="hm-cavity"'));
  // gantry post and arm that hold the ticket
  push(mat("hm-brass", cyl(POST[0], POST[1], 4.2, HOP_Z, 3, { tone: "mid" }, 28, 0.4)));
  push(cyl(POST[0], POST[1], 2.4, HOP_Z + 3, TK.held + TK.h + 14 - HOP_Z - 3, { tone: "mid", crease: "none" }, 24));
  push(L([HOP_Z + 36, HOP_Z + 66].map((z) => k.sideArc(POST[0], POST[1], 2.4, z, P, 16)).join(""), { tone: "faint" }));
  // hopper cup (brass)
  const HF = G.frameOf([HOP[0], HOP[1], HOP_Z], [0, 0, 1], [1, 0, 0], [0, 1, 0]);
  const cup = [[0, 14], [3.5, 14], [3.5, 9], [9, 9], [10.5, 12, 1], [14, 17, 1], [20, 21.5, 1], [26, 24, 1], [32, 25.5]];
  push(mat("hm-brass", S(G.solidOf(cup, HF, P), { tone: "mid", inner: L(G.arcOf(HF, 3.5, 14, P) + G.arcOf(HF, 9, 9, P), { tone: "faint" }) })));
  push(mat("hm-brass", S(G.ringBand(32, 34.5, 22, 27, HF, P), { tone: "hi" }) + Dt(Array.from({ length: 16 }, (_, i) => at(G.pointOf(HF, 34.5, 24.5, (i / 16) * Math.PI * 2))), { size: 0.45, tone: "mid" })));
  const voidRing = Array.from({ length: 72 }, (_, i) => at(G.pointOf(HF, 34.5, 22, (i / 72) * Math.PI * 2)));
  push(`<g class="hm-cavity"><path class="hm-fill" d="${k.pathOf(voidRing, true)}"/></g>`);
  // arm, back jaw
  const ARM_Z = TK.held + TK.h + 8;
  push(slab({ x: POST[0] - 3.5, y: HOP[1] - 3, w: HOP[0] - POST[0] + 9, d: 6, r: 1.5 }, ARM_Z, 4, { tone: "mid" }, 3, 0.5));
  push(screws([[POST[0], HOP[1], ARM_Z + 4], [HOP[0] + 2, HOP[1], ARM_Z + 4]], 0.45));
  push(mat("hm-brass", slab({ x: HOP[0] - 5, y: HOP[1] - 3, w: 10, d: 2.2, r: 0.6 }, TK.held + TK.h - 4, ARM_Z - (TK.held + TK.h - 4), { tone: "mid" }, 2, 0.3)));
  // ticket: held in the jaws, clipped by the hopper's inner lip as it drops in
  const lower = lowerArc(voidRing);
  defs.push(`<clipPath id="${ID}-tk"><path d="${k.pathOf([[lower[0][0], -400], ...lower, [lower[lower.length - 1][0], -400]], true)}"/></clipPath>`);
  const tkFace = (inner) => faceY(TK.x, TK.y + 0.4, TK.held + TK.h, inner);
  const ticket = mat("hm-paper-sheet", slab({ x: TK.x, y: TK.y - 0.4, w: TK.w, d: 0.8, r: 0.3 }, TK.held, TK.h, { tone: "hi" }, 2, 0)) +
    tkFace(
      `<g class="hm-accent">${rect(TK.w - 17, 3, 14, 5.4, "iso-fill", 1.2)}</g>` + text(TK.w - 10, 6.9, "Example", { size: 3, cls: "hm-on-accent" }) +
      `<text class="iso-face-text" x="3.5" y="15" font-size="4.6" data-ticket="0">Wedding for 300</text>` +
      `<text class="iso-face-text" x="3.5" y="21.5" font-size="4.6" data-ticket="1">in Jaipur, about</text>` +
      `<text class="iso-face-text" x="3.5" y="28" font-size="4.6" data-ticket="2">₹25 lakh</text>` +
      `<path class="iso-line" data-tone="faint" d="M3.5 33H${TK.w - 3.5}" data-free=""/>`,
    );
  live(`<g clip-path="url(#${ID}-tk)"><g data-part="ticket">${ticket}</g></g>`);
  both(mat("hm-brass", slab({ x: HOP[0] - 5, y: HOP[1] + 2.4, w: 10, d: 1.6, r: 0.6 }, TK.held + TK.h - 4, ARM_Z - (TK.held + TK.h - 4), { tone: "mid" }, 2, 0.3)));
  both(mat("hm-brass", cyl(HOP[0], HOP[1] + 3.2, 1.6, ARM_Z - 3, 0.01, {}, 12)));
  hit("ticket", [...box(TK.x, TK.y - 1, TK.rest, TK.x + TK.w, TK.y + 1, TK.held + TK.h)]);
  hit("hopper", box(HOP[0] - 27, HOP[1] - 27, HOP_Z, HOP[0] + 27, HOP[1] + 27, RIM));

  // outlet block on the right face, and levers
  // (levers are live: drawn after the face, rebuilt by the page)
  const leverParts = LEVERS.map((lv) => {
    const quadrant = G.frameOf([lv.x - 2.6, FRONT, PIVOT_Z], [-1, 0, 0], [0, 1, 0], [0, 0, 1]);
    const sector = [[0, 0], ...Array.from({ length: 9 }, (_, i) => { const a = (10 + i * 9) * Math.PI / 180; return [Math.sin(a) * 14, Math.cos(a) * 14]; })];
    push(S(G.prismOf(quadrant, sector, 0, 1.2, P), { tone: "lo" }));
    const F = G.frameOf([lv.x, FRONT, PIVOT_Z], [0, 1, 0], [1, 0, 0], [0, 0, 1]);
    push(mat("hm-brass", S(G.disc(0, 2.6, 4.6, F, P, { steps: 32 }), { tone: "mid", inner: "" })));
    const knob = mat("hm-brass", S(G.sphereOf([0, 0, 0], 3.6, P, { steps: 36 }), { tone: "hi" }));
    const o = at([0, 0, 0]);
    live(`<g data-lever="${lv.id}"><path class="hm-rod hm-rod-edge" stroke-width="${f1(2.8 * KS)}"/><path class="hm-rod hm-rod-body" stroke-width="${f1(2.8 * KS - 1.2)}"/><path class="hm-rod hm-rod-shine" stroke-width="${f1(0.7 * KS)}"/><g data-knob>${knob}</g></g>`);
    both(mat("hm-brass", S(G.disc(2.6, 3.8, 2.2, F, P, { steps: 24 }), { tone: "hi" })));
    hit(`lever-${lv.id}`, [...box(lv.x - 6, FRONT, PIVOT_Z - 6, lv.x + 6, FRONT + ARM + 6, PIVOT_Z + ARM + 6), ...box(lv.x - 6, FRONT, RZ + 12, lv.x + 6, FRONT + 1, RZ + 21)], { button: lv.id, label: lv.label });
    return { id: lv.id, pivot: [lv.x, FRONT + 3.8, PIVOT_Z], origin: o };
  });
  {
    const F = G.frameOf([RESET.x, FRONT, RESET.z], [0, 1, 0], [1, 0, 0], [0, 0, 1]);
    push(S(G.disc(0, 1.6, 6, F, P, { steps: 36 }), { tone: "lo" }));
    live(`<g data-part="reset-cap">${mat("hm-brass", S(G.disc(1.6, 4.2, 4.2, F, P, { steps: 32, bevel: 0.4 }), { tone: "hi" }))}</g>`);
    hit("reset", [...box(RESET.x - 8, FRONT, RZ + 12, RESET.x + 8, FRONT + 5, RESET.z + 7)], { button: "reset", label: "Reset" });
  }

  // ---------- tanks ----------
  sec("tanks");
  const tankData = [];
  TANKS.forEach((cx, i) => {
    const plan = { x: cx - TW / 2, y: TY - TW / 2, w: TW, d: TW, r: 2 };
    const fy = plan.y + plan.d;
    push(halo(plan, TZ, 4));
    push(slab(k.insetPlan(plan, -1.6), TZ, 4, { tone: "lo" }, 4, 0.5));
    push(S(k.slabOf(plan, TZ + 4, T_TOP - 4, P, 4, 0), { tone: "mid", inner: L(k.sideSeam(plan, TZ + 26, P, 4), { tone: "faint" }) }));
    // drain tap on the right face
    const TF = G.frameOf([plan.x + plan.w, TY + 4, TZ + 9], [1, 0, 0], [0, 1, 0], [0, 0, 1]);
    push(mat("hm-brass", S(G.disc(0, 3, 1.9, TF, P, { steps: 20 }), { tone: "mid" }) + S(G.disc(3, 4.2, 2.6, TF, P, { steps: 20 }), { tone: "hi" })));
    // window: bezel, glass, coin stack (live), graduation ticks
    const x0 = cx - WIN.w / 2;
    const wh = WIN.z1 - WIN.z0;
    const glass = rect(0, 0, WIN.w, wh, "hm-fill", 1);
    const lines = Array.from({ length: Math.ceil(wh / 2.2) }, (_, j) => `M0 ${f1(wh - j * 2.2 - 1.1)}H${WIN.w}`).join("");
    defs.push(`<clipPath id="${ID}-lv${i}"><rect data-level="${i}" x="0" y="${wh}" width="${WIN.w}" height="0"/></clipPath>`);
    const stack = `<g clip-path="url(#${ID}-lv${i})"><g class="hm-gold">${rect(0, 0, WIN.w, wh, "hm-gold-fill")}<path class="iso-line" data-tone="lo" d="${lines}"/></g></g>`;
    const surface = `<path class="iso-line" data-tone="hi" data-surface="${i}" d="M0 ${wh}H${WIN.w}" />`;
    const ticks = [1, 2, 3, 4].map((n) => `M0 ${f1(wh - (n * 0.1 / FULL) * wh)}h${n === 2 || n === 4 ? 3 : 1.8}`).join("");
    live(faceY(x0, fy, TZ + WIN.z1, `<g class="hm-glass">${glass}</g>${stack}${surface}<path class="iso-line" data-tone="mid" d="${ticks}"/><rect class="iso-line" data-tone="lo" x="0" y="0" width="${WIN.w}" height="${wh}" rx="1" fill="none"/>`));
    push(slab({ x: x0 - 1.4, y: fy, w: WIN.w + 2.8, d: 0.8, r: 0.3 }, TZ + WIN.z1, 1.4, { tone: "mid" }, 2, 0));
    push(slab({ x: x0 - 1.4, y: fy, w: WIN.w + 2.8, d: 0.8, r: 0.3 }, TZ + WIN.z0 - 1.4, 1.4, { tone: "mid" }, 2, 0));
    // label plate
    push(slab({ x: cx - 11, y: fy, w: 22, d: 0.7, r: 0.3 }, TZ + 4.6, 5.4, { tone: "lo" }, 2, 0));
    push(faceY(cx - 11, fy + 0.7, TZ + 10, text(11, 4.2, BUCKETS[i].name, { size: 3.9 })));
    push(screws([[plan.x + 2.4, fy, TZ + T_TOP - 2], [plan.x + plan.w - 2.4, fy, TZ + T_TOP - 2]], 0.42));
    // cap, intake and spout up to the chute
    push(mat("hm-brass", slab(k.insetPlan(plan, -0.8), TZ + T_TOP, CAP, { tone: "mid" }, 4, 0.8) + screws(k.corners(k.insetPlan(plan, -0.8), 2.6).map(([x, y]) => [x, y, TZ + T_TOP + CAP]), 0.42)));
    const last = C.chutes[C.chutes.length - 1];
    const gate = (cx - last.o[0]) / last.a[0];
    const floorZ = last.o[2] + last.a[2] * gate;
    const top = TZ + T_TOP + CAP;
    push(mat("hm-brass", cyl(cx, TY, 6, top, 3, { tone: "mid" }, 28, 0.5) + cyl(cx, TY, 3.6, top + 3, floorZ - 1.6 - (top + 3), { tone: "mid", crease: "none" }, 24)));
    push(mat("hm-brass", L(k.sideArc(cx, TY, 3.6, floorZ - 6, P, 16), { tone: "faint" })));
    tankData.push({ i, cx, gate, wh, w: WIN.w });
    hit(`tank-${BUCKETS[i].id}`, box(plan.x - 1.6, plan.y, TZ, plan.x + plan.w + 4, plan.y + plan.d + 1, top));
  });

  // ---------- chutes ----------
  sec("chutes");
  // Each chute is a U channel: back wall, floor, coins, front wall. Its u axis may point
  // along +y or -y; f flips the walls so the low front wall always faces the viewer.
  const COINS = 25;
  const segs = [];
  C.chutes.forEach((ch, ci) => {
    const a = ch.a, v = ch.v, u = ch.u;
    const CF = G.frameOf(ch.o, a, u, v);
    const f = u[1] > 0 ? 1 : -1;
    const pr = (poly, s0, s1, style) => S(G.prismOf(CF, poly, s0, s1, P), style);
    const wall = (u0, u1, h) => { const p = Math.min(u0 * f, u1 * f), q = Math.max(u0 * f, u1 * f); return [[p, 0], [q, 0], [q, h], [p, h]]; };
    const on = (s, uu, h) => G.add3(G.add3(ch.o, G.mul3(a, s)), G.add3(G.mul3(u, uu * f), G.mul3(v, h)));
    push(mat("hm-brass", pr(wall(-5.6, -4.4, 7.5), 0, ch.len, { tone: "mid" })));
    push(pr([[-5.6, -1.6], [5.6, -1.6], [5.6, 0], [-5.6, 0]], 0, ch.len, { tone: "mid" }));
    const isLast = ci === C.chutes.length - 1;
    if (isLast) for (const t of tankData) {
      const q = [on(t.gate - 4, -2.2, 0.02), on(t.gate + 4, -2.2, 0.02), on(t.gate + 4, 2.2, 0.02), on(t.gate - 4, 2.2, 0.02)].map(at);
      push(`<g class="hm-cavity"><path class="hm-fill" d="${k.pathOf(q, true)}"/></g>${L(k.pathOf(q, true), { tone: "lo" })}`);
      push(mat("hm-brass", S(G.disc(0, 1.6, 1.3, G.frameAlong(on(t.gate + 5, -4.4, 4.5), [0, 1, 0]), P, { steps: 16 }), { tone: "hi" })));
    }
    push(L(k.pathOf([on(0, 0, 0.02), on(ch.len, 0, 0.02)].map(at)), { tone: "faint" }));
    const edge = [on(-10, 4.4, 0), on(ch.len + 4, 4.4, 0)].map(at);
    defs.push(`<clipPath id="${ID}-coins${ci}"><path d="${k.pathOf([[edge[0][0], edge[0][1] - 400], edge[0], edge[1], [edge[1][0], edge[1][1] - 400]], true)}"/></clipPath>`);
    live(`<g clip-path="url(#${ID}-coins${ci})">${Array.from({ length: COINS }, (_, i) => `<g data-coin="${i}" data-seg="${ci}"></g>`).join("")}</g>`);
    both(mat("hm-brass", pr(wall(4.4, 5.6, 3.2), 0, ch.len, { tone: "mid" })));
    both(mat("hm-brass", pr([[-5.6, -1.6], [5.6, -1.6], [5.6, 4.5], [-5.6, 4.5]], ch.len, ch.len + 1.4, { tone: "mid" })));
    both(Dt([0.1, 0.35, 0.6, 0.85].map((x) => at(on(ch.len * x, 5.6, 1.6))), { size: 0.42, tone: "mid" }));
    if (ch.after) ch.after(X, both, P);
    segs.push({ o: ch.o, a, v, len: ch.len, start: ch.start ?? 0 });
    hit(ci === 0 ? "chute" : `chute${ci}`, [on(0, -6, -2), on(0, 6, -2), on(0, -6, 8), on(ch.len, -6, -2), on(ch.len, 6, -2), on(ch.len, -6, 8), on(ch.len, 6, 4)]);
  });
  // outlet block over the first chute's top end
  const RIGHT = RB.x + RB.w;
  const C0 = C.chutes[0].o;
  both(mat("hm-brass", slab({ x: RIGHT, y: C0[1] - 7.5, w: 9, d: 15, r: 1.2 }, C0[2] - 5, 13, { tone: "mid" }, 3, 0.6)));
  both(mat("hm-brass", screws([[RIGHT + 6.5, C0[1] - 5, C0[2] + 8], [RIGHT + 6.5, C0[1] + 5, C0[2] + 8]], 0.42)));

  // ---------- tag cabinet and calendar drum ----------
  sec("drum");
  push(halo(CAB, 0, 4));
  push(S(k.slabOf(CAB, 0, CAB_H, P, 4, 0.8), { tone: "mid", inner: L(k.sideSeam(CAB, 6, P, 4), { tone: "faint" }) }));
  push(L(k.planOutline(k.insetPlan(CAB, 4), CAB_H, P, 4), { tone: "faint" }));
  // tag slots on the cabinet's right face
  const CABR = CAB.x + CAB.w;
  push(faceX(CABR, CAB.y + CAB.d, 20, LANES.map((ly) => `<g class="hm-cavity">${rect(CAB.y + CAB.d - ly - 9.5, 0, 19, 15, "hm-fill", 1)}</g><rect class="iso-line" data-tone="lo" x="${f1(CAB.y + CAB.d - ly - 9.5)}" y="0" width="19" height="15" rx="1" fill="none"/>`).join("")));
  push(screws([[CABR, CAB.y + 3, CAB_H - 3], [CABR, CAB.y + CAB.d - 3, CAB_H - 3]], 0.45));
  // back cheek with pointer tower, front post with bearing and month window
  const DF = G.frameOf([DRUM.c[0], 0, DRUM.c[2]], [0, 1, 0], [1, 0, 0], [0, 0, 1]);
  push(slab({ x: DRUM.c[0] - 16, y: CAB.y + 1, w: 32, d: 4, r: 1.5 }, CAB_H, DRUM.c[2] - CAB_H + 6, { tone: "mid" }, 3, 0.5));
  push(slab({ x: DRUM.c[0] - 4, y: CAB.y + 1, w: 8, d: 4, r: 1.5 }, DRUM.c[2] + 6, DRUM.r + 2, { tone: "mid" }, 3, 0.5));
  push(mat("hm-brass", S(G.disc(DRUM.s0 - 1, DRUM.s0, 5, DF, P, { steps: 28 }), { tone: "mid" })));
  push(mat("hm-brass", S(G.ringBand(DRUM.s0, DRUM.s0 + 3, 19, 21.2, DF, P), { tone: "mid" })));
  push(S(G.disc(DRUM.s0 + 3, DRUM.s1 - 3, DRUM.r, DF, P), { tone: "hi", crease: "lo" }));
  live(`<g data-part="ribs">${Array.from({ length: 12 }, (_, i) => `<path class="iso-line" data-tone="lo" data-rib="${i}" d=""/>`).join("")}</g>`);
  both(mat("hm-brass", S(G.ringBand(DRUM.s1 - 3, DRUM.s1, 0, 21.2, DF, P), { tone: "mid" })));
  live(mat("hm-brass", `<path class="iso-line" data-tone="mid" data-part="drum-ticks" d=""/>`)); both(mat("hm-brass", L(G.circleOf(DF, DRUM.s1, 14, P, 64) + G.circleOf(DF, DRUM.s1, 19.4, P, 72), { tone: "lo" })));
  both(slab({ x: DRUM.c[0] - 1.6, y: CAB.y + 3, w: 3.2, d: DRUM.s1 - CAB.y, r: 1 }, DRUM.c[2] + DRUM.r + 3, 2.4, { tone: "mid" }, 2, 0.3));
  both(mat("hm-brass", slab({ x: DRUM.c[0] - 1, y: DRUM.s1 + 0.6, w: 2, d: 1.2, r: 0.3 }, DRUM.c[2] + DRUM.r - 3, 6, { tone: "hi", lit: true }, 2, 0)));
  both(S(G.disc(DRUM.s1, DRUM.s1 + 4.2, 2.4, DF, P, { steps: 20 }), { tone: "mid" }));
  const FP = { x: DRUM.c[0] - 9, y: DRUM.s1 + 4.2, w: 18, d: 4, r: 1.2 };
  both(slab(FP, CAB_H, DRUM.c[2] - CAB_H, { tone: "mid" }, 3, 0.5));
  both(mat("hm-brass", S(G.disc(DRUM.s1 + 8.2, DRUM.s1 + 9.6, 4.4, DF, P, { steps: 28 }), { tone: "mid" }) + S(G.disc(DRUM.s1 + 9.6, DRUM.s1 + 10.6, 2.4, DF, P, { steps: 20 }), { tone: "hi" })));
  live(faceY(FP.x + 3, FP.y + FP.d, CAB_H + 15, `<g class="hm-glass">${rect(0, 0, 12, 9, "hm-fill", 1)}</g><text class="iso-face-text" data-part="month" x="6" y="6.6" font-size="5.4" text-anchor="middle">Dec</text><rect class="iso-line" data-tone="lo" x="0" y="0" width="12" height="9" rx="1" fill="none"/>`));
  both(screws([[FP.x + 2.4, FP.y + FP.d, CAB_H + 3], [FP.x + FP.w - 2.4, FP.y + FP.d, CAB_H + 3]], 0.42));
  hit("drum", [...box(DRUM.c[0] - 22, CAB.y, CAB_H, DRUM.c[0] + 22, DRUM.s1 + 11, DRUM.c[2] + DRUM.r + 6), ...box(CAB.x, CAB.y, 0, CAB.x + CAB.w, CAB.y + CAB.d, CAB_H)]);

  // ---------- book-by board ----------
  sec("board");
  push(halo(BOARD, 0, 3));
  push(slab(BOARD, 0, BOARD_H, { tone: "mid" }, 4, 1));
  for (const ly of LANES) {
    const groove = { x: BOARD.x + 4, y: ly - 1.2, w: BOARD.w - 8, d: 2.4, r: 1.2 };
    push(`<g class="hm-cavity"><path class="hm-fill" d="${k.onTop(k.ringOf(groove, 3), BOARD_H, P, true)}"/></g>${L(k.planOutline(groove, BOARD_H, P, 3), { tone: "lo" })}`);
  }
  const RUL = { x: DAY_X - PER_MONTH * 10 - 3, y: BOARD.y + BOARD.d - 7, w: PER_MONTH * 10 + 6, d: 5.5, r: 1 };
  push(slab(RUL, BOARD_H, 0.6, { tone: "lo", crease: "none" }, 3, 0));
  const tt = k.topTicks(DAY_X - PER_MONTH * 10, DAY_X + 0.01, PER_MONTH / 2, 2, RUL.y, BOARD_H + 0.6, [1.6, 3], P);
  push(L(tt.minor, { tone: "lo" }), L(tt.major, { tone: "mid" }));
  push(L(k.lineOnTop([DAY_X, RUL.y], [DAY_X, RUL.y + RUL.d], BOARD_H + 0.6, P), { tone: "hi" }));
  // "the day" post at the far end of the rail
  push(mat("hm-brass", cyl(DAY_X, BOARD.y + 4, 3, BOARD_H, 1.4, { tone: "mid" }, 20) + cyl(DAY_X, BOARD.y + 4, 1.3, BOARD_H + 1.4, 22, { tone: "mid", crease: "none" }, 16)));
  push(mat("hm-gold", S(G.disc(0, 1.2, 4.2, G.frameOf([DAY_X, BOARD.y + 4, BOARD_H + 27], [0, 1, 0], [1, 0, 0], [0, 0, 1]), P, { steps: 28 }), { tone: "hi", lit: true })));
  push(screws(k.corners(BOARD, 3).map(([x, y]) => [x, y, BOARD_H]), 0.42));
  // tags: one clip per lane so a tag appears out of its slot in the cabinet face
  const tagSvg = BUCKETS.map((b, i) => {
    const ly = LANES[i];
    const sx = at([CABR, ly, 0])[0];
    defs.push(`<clipPath id="${ID}-tag${i}"><rect x="${f1(sx)}" y="-1000" width="3000" height="3000"/></clipPath>`);
    const body = mat("hm-paper-sheet", slab({ x: -TAG.w / 2, y: ly - 0.6, w: TAG.w, d: 1.2, r: 0.8 }, TAG.seat, TAG.h, { tone: "hi" }, 3, 0));
    const face = faceY(-TAG.w / 2, ly + 0.6, TAG.seat + TAG.h, `<g class="hm-gold">${rect(0, 0, 3.2, TAG.h, "hm-gold-fill", 0.8)}</g><circle class="iso-line" data-tone="mid" cx="1.6" cy="3" r="0.9"/>` + text(TAG.w / 2 + 1.6, 7.4, b.name, { size: 3.6 }));
    return `<g clip-path="url(#${ID}-tag${i})"><g data-tag="${b.id}">${body}${face}</g></g>`;
  });
  live(...tagSvg);
  BUCKETS.forEach((b, i) => hit(`lane-${b.id}`, box(BOARD.x + 2, LANES[i] - 3, BOARD_H - 1, BOARD.x + BOARD.w - 2, LANES[i] + 3, BOARD_H + TAG.h)));

  // ---------- press, tray, card ----------
  sec("press");
  push(halo(PRESS, 0, 4));
  push(slab(k.insetPlan(PRESS, -1.4), 0, 3, { tone: "lo" }, 4, 0.5));
  push(S(k.slabOf(PRESS, 3, PRESS_H - 3, P, 5, 1), { tone: "mid", inner: L(k.sideSeam(PRESS, 22, P, 5), { tone: "faint" }) }));
  push(L(k.planOutline(k.insetPlan(PRESS, 4), PRESS_H, P, 5), { tone: "faint" }));
  push(screws(k.corners(PRESS, 4).map(([x, y]) => [x, y, PRESS_H])));
  const PR = PRESS.x + PRESS.w;
  push(faceX(PR, CARD.y + CARD.d + 2, CARD.z + 2.2, `<g class="hm-cavity">${rect(0, 0, CARD.d + 4, 3.6, "hm-fill", 1.6)}</g><rect class="iso-line" data-tone="lo" x="0" y="0" width="${CARD.d + 4}" height="3.6" rx="1.6" fill="none"/>`));
  // two rollers' knurled knob on the press's front face
  {
    const F = G.frameOf([PRESS.x + 30, PRESS.y + PRESS.d, 20], [0, 1, 0], [1, 0, 0], [0, 0, 1]);
    push(S(G.disc(0, 2, 5.2, F, P, { steps: 32 }), { tone: "mid" }));
    push(mat("hm-brass", S(G.disc(2, 5.2, 4.2, F, P, { steps: 32, bevel: 0.4 }), { tone: "hi" }) + k.fadedSvg(G.ribsOf(F, 2, 5.2, 4.2, 30, P, { fade: [0.1, 0.55] }), { tone: "lo" })));
    push(slab({ x: PRESS.x + 6, y: PRESS.y + PRESS.d, w: 16, d: 0.7, r: 0.3 }, 12, 14, { tone: "lo" }, 2, 0));
    push(faceY(PRESS.x + 6, PRESS.y + PRESS.d + 0.7, 26, `<path class="iso-line" data-tone="lo" data-free="" d="M3 4.5H12M3 7.5H9.5M3 10.5H11"/>`));
  }
  const TRAY = { x: PR, y: CARD.y - 3, w: 32, d: CARD.d + 6, r: 1.2 };
  push(slab({ x: PR, y: TRAY.y + 4, w: 6, d: 2.4, r: 0.4 }, 14, CARD.z - 1.6 - 14, { tone: "mid" }, 2, 0));
  push(slab({ x: PR, y: TRAY.y + TRAY.d - 6.4, w: 6, d: 2.4, r: 0.4 }, 14, CARD.z - 1.6 - 14, { tone: "mid" }, 2, 0));
  push(slab(TRAY, CARD.z - 1.6, 1.4, { tone: "mid" }, 3, 0.4));
  const cardEdge = [at([PR, -200, CARD.z]), at([PR, 200, CARD.z])];
  const dir = [cardEdge[1][0] - cardEdge[0][0], cardEdge[1][1] - cardEdge[0][1]];
  const far = (p, s) => [p[0] + dir[1] * s, p[1] - dir[0] * s];
  defs.push(`<clipPath id="${ID}-card"><path d="${k.pathOf([cardEdge[0], cardEdge[1], far(cardEdge[1], 4), far(cardEdge[0], 4)], true)}"/></clipPath>`);
  const cardTop = (inner) => X.top(CARD.inX, CARD.y, CARD.z + 0.8, inner);
  const bars = BUCKETS.map((b, i) => `<rect class="hm-gold-fill" data-bar="${i}" x="9" y="${f1(5 + i * 4.6)}" width="10" height="2.4" rx="0.6"/>`).join("");
  const card = mat("hm-paper-sheet", slab({ x: CARD.inX, y: CARD.y, w: CARD.w, d: CARD.d, r: 1.2 }, CARD.z, 0.8, { tone: "hi" }, 3, 0)) +
    cardTop(`<rect class="hm-accent-fill" x="0.8" y="0.8" width="5" height="${CARD.d - 1.6}" rx="0.8"/>${bars}<path class="iso-line" data-tone="lo" data-free="" d="${BUCKETS.map((_, i) => `M9 ${f1(4 + i * 4.6)}h0`).join("")}"/>`);
  live(`<g clip-path="url(#${ID}-card)"><g data-part="card">${card}</g></g>`);
  hit("card", [...box(PRESS.x, PRESS.y, 0, PRESS.x + PRESS.w, PRESS.y + PRESS.d, PRESS_H), ...box(PR, TRAY.y, CARD.z - 2, PR + TRAY.w, TRAY.y + TRAY.d, CARD.z + 1)]);

  // ---------- phone on its dock ----------
  sec("phone"); mode = "both";
  const DOCK = { x: PHONE.x - 6, y: PHONE.y - 12, w: PHONE.w + 12, d: 28, r: 4 };
  push(halo(DOCK, 0, 4));
  push(slab(DOCK, 0, 6, { tone: "mid" }, 5, 0.8));
  push(slab({ x: PHONE.x - 2, y: PHONE.y - 4, w: PHONE.w + 4, d: 4, r: 1.2 }, 6, 22, { tone: "mid" }, 3, 0.5));
  push(slab({ x: PHONE.x - 2, y: PHONE.y + PHONE.d, w: PHONE.w + 4, d: 3, r: 1 }, 6, 7.4, { tone: "mid" }, 3, 0.5));
  push(S(k.slabOf({ x: PHONE.x, y: PHONE.y, w: PHONE.w, d: PHONE.d, r: 4.6 }, PHONE.z0, PHONE.z1 - PHONE.z0, P, 6, 0.6), { tone: "hi" }));
  push(slab({ x: PHONE.x - 2, y: PHONE.y + PHONE.d, w: PHONE.w + 4, d: 3, r: 1 }, 6, 7.4, { tone: "mid" }, 3, 0.5));
  const SC = { x: 3, y: 4, w: PHONE.w - 6, h: PHONE.z1 - PHONE.z0 - 8 };
  const rows = BUCKETS.map((b, i) => `<text class="iso-face-text" data-tone="mid" x="${SC.x + 3.5}" y="${f1(SC.y + 30 + i * 6.4)}" font-size="3.7">${b.name}</text><text class="iso-face-text" x="${SC.x + SC.w - 3.5}" y="${f1(SC.y + 30 + i * 6.4)}" font-size="3.7" text-anchor="end" data-row="${i}">₹0 lakh</text>`).join("");
  const screenOn = `<g data-part="screen-on" opacity="0">
    <rect class="hm-screen" x="${SC.x}" y="${SC.y}" width="${SC.w}" height="${SC.h}" rx="3"/>
    <text class="iso-face-text" data-tone="mid" x="${SC.x + 3.5}" y="${SC.y + 9}" font-size="3.4">Example plan</text>
    <text class="iso-face-text" x="${SC.x + 3.5}" y="${SC.y + 16}" font-size="4.6" font-weight="600" data-part="phone-title">Wedding, Jaipur</text>
    <text class="iso-face-text" data-tone="mid" x="${SC.x + 3.5}" y="${SC.y + 22}" font-size="3.4" data-part="phone-sub">300 guests · December</text>
    <path class="iso-line" data-tone="faint" d="M${SC.x} ${SC.y + 25}H${SC.x + SC.w}"/>
    ${rows}
    <path class="iso-line" data-tone="faint" d="M${SC.x} ${f1(SC.y + 52)}H${SC.x + SC.w}"/>
    <text class="iso-face-text" data-tone="mid" x="${SC.x + 3.5}" y="${f1(SC.y + 58)}" font-size="3.4">Book the venue</text><text class="iso-face-text" x="${SC.x + 3.5}" y="${f1(SC.y + 63)}" font-size="3.6" data-part="phone-book">7½ months ahead</text>
    <rect class="hm-accent-fill" x="${SC.x + 3.5}" y="${f1(SC.h - 10)}" width="${SC.w - 7}" height="9" rx="4.5"/>
    <text class="iso-face-text hm-on-accent" x="${SC.x + SC.w / 2}" y="${f1(SC.h - 4.2)}" font-size="4.2" font-weight="600" text-anchor="middle">Send to family</text>
  </g>`;
  live(faceY(PHONE.x, PHONE.y + PHONE.d, PHONE.z1, `<rect class="hm-screen-off" x="${SC.x}" y="${SC.y}" width="${SC.w}" height="${SC.h}" rx="3"/>${screenOn}<rect class="iso-line" data-tone="mid" x="${SC.x}" y="${SC.y}" width="${SC.w}" height="${SC.h}" rx="3" fill="none"/><rect class="iso-line" data-tone="lo" x="${PHONE.w / 2 - 5}" y="1.6" width="10" height="1.2" rx="0.6" fill="none"/>`));
  hit("phone", box(PHONE.x - 2, PHONE.y - 4, 0, PHONE.x + PHONE.w + 2, PHONE.y + PHONE.d + 3, PHONE.z1));

  for (const [name, draw] of Object.entries(C.extra ?? {})) { sec(name); draw(X, push, P); }
  const order_ = C.layers ?? ["base", "reader", "tanks", "chutes", "drum", "board", "press", "phone"];
  const out = order_.flatMap((name) => layers[name] ?? []);
  const liveOut = order_.flatMap((name) => lives[name] ?? []);
  // ---------- page data ----------
  const data = {
    id: ID,
    coinSvg: X.coin(3.1),
    P,
    route: coinRoute(segs, tankData.map((t) => t.gate), { r: 3.1 }),
    tankH: tankData[0].wh,
    full: FULL,
    ticket: { held: TK.held, rest: TK.rest },
    drum: { c: DRUM.c, r: DRUM.r, s1: DRUM.s1, s0: DRUM.s0 + 3, sEnd: DRUM.s1 - 3 },
    lanes: LANES,
    dayX: DAY_X,
    perMonth: PER_MONTH,
    tag: { inX: CABR - TAG.w / 2 - 1, lift: TAG.lift },
    card: { inX: CARD.inX, outX: CARD.outX, axis: [1, 0, 0] },
    levers: leverParts.map(({ id, pivot }) => ({ id, pivot, arm: ARM, rest: 16, pulled: 74 })),
    coinCount: COINS,
    tankW: WIN.w,
  };
  const order = ["ticket", "hopper", "chute", "chute1", ...BUCKETS.map((b) => `tank-${b.id}`), "drum", ...BUCKETS.map((b) => `lane-${b.id}`), "card", "phone"];
  return { W, H, P, defs, body: out, live: liveOut, hits, order, data };
}

// The lower half (on screen) of a closed ring of screen points, from its leftmost to its rightmost point.
function lowerArc(ring) {
  let li = 0, ri = 0;
  ring.forEach((p, i) => { if (p[0] < ring[li][0]) li = i; if (p[0] > ring[ri][0]) ri = i; });
  const walk = (from, to, step) => { const list = []; for (let i = from; ; i = (i + step + ring.length) % ring.length) { list.push(ring[i]); if (i === to) break; } return list; };
  const a = walk(li, ri, 1), b = walk(li, ri, -1);
  const mean = (list) => list.reduce((s, p) => s + p[1], 0) / list.length;
  return mean(a) > mean(b) ? a : b;
}
