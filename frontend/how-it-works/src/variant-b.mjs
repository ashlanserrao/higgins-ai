// Variation B, "Cabinet": the same machine stacked in an upright cabinet with its front
// panels off, read top to bottom. The reader sits on a high shelf, coins run down a
// two-stage chute (out to a turnaround box, then back along the tank shelf), and the
// calendar drum, book-by rail and press share the bottom bay. The phone stands outside.
import { buildMachine } from "./machine-geometry.mjs";
import { G } from "./parts.mjs";

export function buildB() {
  const RZ = 99.5; // reader on the upper shelf
  const TZ = 86;   // tanks on the middle shelf
  const RB = { x: -104, y: -34, w: 92, d: 56, r: 4 };
  const HOP = [RB.x + 46, -6];
  const RIM = RZ + 84 + 34.5;
  const WALL_TOP = 236;
  const BACK = { x: -118, y: -58, w: 300, d: 5, r: 0.8 };
  const LEFT = { x: -118, y: -53, w: 5, d: 117, r: 0.8 };
  const UPPER = { x: -113, y: -53, w: 113, d: 79, r: 1.2 };
  const SHELF = { x: -2, y: 20, w: 160, d: 42, r: 1.2 };
  const BOX = { x: 132, y: -15, w: 15, d: 49, r: 2 };

  const frame = (X, push, P) => {
    const { slab, screws } = X;
    // back and left walls with panel seams and screws
    push(X.halo(BACK, 0, 4));
    push(slab(BACK, 0, WALL_TOP, { tone: "lo" }, 2, 0));
    push(slab(LEFT, 0, WALL_TOP, { tone: "lo" }, 2, 0));
    const seam = (x) => X.L(X.k.segment([x, BACK.y + BACK.d, 0], [x, BACK.y + BACK.d, WALL_TOP], P), { tone: "faint" });
    push(seam(-40), seam(36), seam(110));
    push(X.L(X.k.segment([LEFT.x + LEFT.w, 4, 0], [LEFT.x + LEFT.w, 4, WALL_TOP], P), { tone: "faint" }));
    push(screws([-114, -44, -36, 32, 40, 106, 114, 178].flatMap((x) => [[x, BACK.y + BACK.d, 8], [x, BACK.y + BACK.d, WALL_TOP - 8]]), 0.42));
    // brackets that carry the upper shelf, the turnaround box and the first chute
    for (const x of [-96, -30]) push(slab({ x, y: BACK.y + BACK.d, w: 4, d: 26, r: 0.6 }, RZ - 6.5 - 14, 14, { tone: "mid" }, 2, 0.3));
    push(slab(UPPER, RZ - 6.5, 6.5, { tone: "mid" }, 3, 0.8));
    push(screws(X.k.corners(UPPER, 4).map(([x, y]) => [x, y, RZ]), 0.42));
    push(slab({ x: 66, y: BACK.y + BACK.d, w: 4, d: 47, r: 0.6 }, 168.4, 3, { tone: "mid" }, 2, 0.3));
    push(slab({ x: 138, y: BACK.y + BACK.d, w: 4, d: BOX.y - BACK.y - BACK.d, r: 0.6 }, 168, 4, { tone: "mid" }, 2, 0.3));
  };
  const legs = (X, push) => {
    for (const x of [SHELF.x + 4, SHELF.x + SHELF.w - 8]) push(X.slab({ x, y: SHELF.y + SHELF.d - 6, w: 4, d: 4, r: 0.6 }, 0, TZ - 6, { tone: "mid" }, 2, 0.3));
  };
  const shelf = (X, push, P) => {
    // the tank shelf on two legs, held at the back by the left wall
    push(X.slab(SHELF, TZ - 6, 6, { tone: "mid" }, 3, 0.8));
    push(X.L(X.k.sideSeam(SHELF, TZ - 3, P, 3), { tone: "faint" }));
    push(X.screws(X.k.corners(SHELF, 4).map(([x, y]) => [x, y, TZ]), 0.42));
  };
  const turnaround = (X, push) => {
    // coins fall into this box at the end of the first chute and leave it on the second
    push(X.mat("hm-brass", X.slab(BOX, 150, 26, { tone: "mid" }, 3, 0.8) + X.L(X.k.planOutline(X.k.insetPlan(BOX, 2.5), 176, X.P, 3), { tone: "lo" })));
    push(X.mat("hm-brass", X.screws(X.k.corners(BOX, 2.4).map(([x, y]) => [x, y, 176]), 0.42)));
  };

  return buildMachine({
    id: "B",
    W: 860, H: 1000, AZ: 50, EL: 30,
    RZ, TZ, TY: 40,
    BASE: { x: -132, y: -66, w: 364, d: 202, r: 10 },
    RB, RB_H: 84, HOP,
    TK: { w: 44, h: 40, y: -6, x: HOP[0] - 22, held: RIM + 19.5, rest: RIM - 10.5 },
    POST: [RB.x + 10, -6],
    chutes: [
      { o: [-2, -6, RZ + 80], a: G.unit3([1, 0, -0.1]), v: G.unit3([0.1, 0, 1]), u: [0, 1, 0], len: 140, start: -6, after: turnaround },
      { o: [140, 40, 158], a: G.unit3([-1, 0, -0.06]), v: G.unit3([-0.06, 0, 1]), u: [0, -1, 0], len: 138 },
    ],
    TANKS: [18, 52, 86, 120], TW: 28, T_TOP: 46, CAP: 5,
    WIN: { w: 18, z0: 12, z1: 42 }, FULL: 0.45,
    CAB: { x: -104, y: 66, w: 66, d: 56, r: 3 }, CAB_H: 30,
    DRUM: { c: [-71, 0, 56], r: 20, s0: 72, s1: 112 },
    BOARD: { x: -38, y: 66, w: 90, d: 66, r: 3 }, BOARD_H: 8,
    LANES: [74, 88, 102, 116], DAY_X: 46, PER_MONTH: 7.6,
    TAG: { w: 16, h: 12, seat: 7, lift: 2.6 },
    PRESS: { x: 58, y: 68, w: 40, d: 46, r: 4 }, PRESS_H: 36,
    CARD: { w: 30, d: 26, y: 77, z: 30.6, inX: 66, outX: 101 },
    PHONE: { x: 166, y: 114, w: 46, d: 5, z0: 12, z1: 100 },
    LEVERS: [
      { id: "guests", x: RB.x + 18, label: "+25 guests", plate: 28 },
      { id: "date", x: RB.x + 48, label: "Move the date", plate: 30 },
    ],
    RESET: { x: RB.x + 75, z: RZ + 44 }, PIVOT_Z: RZ + 46, ARM: 24,
    label: { x: 176, y: 30, w: 40, d: 12, r: 1.5 },
    fit: [[BACK.x, BACK.y, WALL_TOP + 3], [LEFT.x, LEFT.y + LEFT.d, WALL_TOP + 3]],
    frame,
    extra: { legs, shelf },
    layers: ["base", "legs", "drum", "board", "press", "shelf", "reader", "tanks", "chutes", "phone"],
  });
}
