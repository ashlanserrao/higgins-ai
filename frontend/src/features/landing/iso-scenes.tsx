// The three "what you get" drawings, one per card: vendor quotes measured against a fair-price
// band, book-by dates working back from the event, and the plan reaching four phones. Each plays
// once when its card comes into view and holds its last frame. They illustrate the card's own
// title and line, so they say nothing the text doesn't. Loaded on demand (see sections.tsx).

import { domMin, LazyMotion, useTransform, type MotionValue } from "motion/react";
import { ACCENT, Face, Floor, IsoStage, LiveContext, Path, Prism, Ring, arc, line, read, useLoop, useTween, type Point } from "./iso";

/* ---- A budget that adds up ---- */

const WALL_Y = -26; // the glass wall behind the quotes
const BAND = [36, 58]; // the fair-price band on it, as heights
const QUOTES = [{ x: -62, h: 28 }, { x: -26, h: 42 }, { x: 10, h: 50 }, { x: 46, h: 72 }];

function Budget({ label }: { label: string }) {
  // A caliper sweeps the wall; each fair quote lights as it passes.
  const sweep = useTween(80, { from: -80, delay: 1.7, duration: 2.3 });
  const caliperIn = useTween(1, { delay: 1.7, duration: 0.2 });
  const caliperOut = useTween(0, { from: 1, delay: 4.3, duration: 0.6 });
  const caliper = useTransform(() => caliperIn.get() * caliperOut.get());
  const wall = (z0: number, z1: number): Point[] => [[-80, WALL_Y, z0], [80, WALL_Y, z0], [80, WALL_Y, z1], [-80, WALL_Y, z1]];

  return (
    <IsoStage label={label} offset={23}>
      <Floor a={100} b={50} slab={[160, 68]} />
      <Face style={{ fill: "var(--iso-top)", fillOpacity: 0.55 }} corners={() => wall(0, 76)} />
      <Face style={{ fill: "var(--iso-accent)", fillOpacity: 0.15, stroke: "var(--iso-accent)" }} corners={() => wall(BAND[0], BAND[1])} />
      <Path style={{ stroke: "var(--iso-accent)", strokeWidth: 1.5, opacity: caliper }} d={() => line([sweep.get(), WALL_Y, 0], [sweep.get(), WALL_Y, 80])} />
      <Face
        style={{ fill: "var(--iso-accent)", stroke: "var(--iso-accent)", opacity: caliper }}
        corners={() => { const x = sweep.get(); return [[x - 4, WALL_Y, 80], [x, WALL_Y - 4, 80], [x + 4, WALL_Y, 80], [x, WALL_Y + 4, 80]]; }}
      />
      {QUOTES.map((quote, index) => <Quote key={quote.x} {...quote} delay={0.2 + 0.15 * index} sweep={sweep} />)}
    </IsoStage>
  );
}

function Quote({ x, h, delay, sweep }: { x: number; h: number; delay: number; sweep: MotionValue<number> }) {
  const height = useTween(h, { delay });
  const lit = useTransform(sweep, [x + 9, x + 17], [0, 1]);
  return (
    <>
      <Prism x={x} y={-13} w={26} d={26} h={height} />
      {h >= BAND[0] && h <= BAND[1] && (
        <Face
          style={{ fill: "var(--iso-accent)", opacity: lit }}
          corners={() => { const z = height.get(); return [[x, -13, z], [x + 26, -13, z], [x + 26, 13, z], [x, 13, z]]; }}
        />
      )}
    </>
  );
}

/* ---- Book-by dates ---- */

const tile = (col: number, row: number) => [-66 + 22 * col, -33 + 22 * row] as const;
const [EVENT_X, EVENT_Y] = tile(6, 1);
const TOWER = 34;
const FIRST_AT = 3.3; // when the earliest booking is singled out
// Back to front. `step` is the order they appear in: working back from the event, so the
// latest booking comes first and the earliest (the tallest lead time) last.
const PINS = [
  { col: 0, row: 3, h: 30, step: 3 },
  { col: 2, row: 1, h: 22, step: 2 },
  { col: 5, row: 0, h: 10, step: 0 },
  { col: 3, row: 3, h: 16, step: 1 },
];
const EARLIEST = PINS.find((pin) => pin.step === PINS.length - 1)!;
const pinStart = (step: number) => 1.3 + 0.4 * step;

function BookBy({ label }: { label: string }) {
  const tower = useTween(TOWER, { delay: 0.5 });
  const flag = useTween(1, { delay: 1.0 });
  // The earliest booking turns accent, lifts and bobs, inside a pulsing ring.
  const singled = useTween(1, { delay: FIRST_AT, duration: 0.3 });
  const lift = useTween(6, { delay: FIRST_AT });
  const bob = useLoop(0, 2, { delay: FIRST_AT + 0.6, duration: 1.2 });
  const rise = useTransform(() => lift.get() + bob.get());
  const pulse = useLoop(15, 18, { delay: FIRST_AT, duration: 1.1 });
  const ring = useTransform(() => singled.get() * (1 - (pulse.get() - 15) / 5));
  const [ex, ey] = tile(EARLIEST.col, EARLIEST.row);

  return (
    <IsoStage label={label} offset={-8}>
      <Floor a={100} b={58} slab={[160, 92]} />
      {Array.from({ length: 28 }, (_, i) => <Tile key={i} col={i % 7} row={Math.floor(i / 7)} />)}
      <Ring x={ex} y={ey} r={pulse} style={{ opacity: ring }} />
      {PINS.map((pin) => <Pin key={pin.step} {...pin} z={pin === EARLIEST ? rise : 0} singled={pin === EARLIEST ? singled : undefined} />)}
      <Prism {...ACCENT} x={EVENT_X - 9} y={EVENT_Y - 9} w={18} d={18} h={tower} />
      <Path
        style={{ stroke: "var(--iso-ink)", opacity: flag }}
        d={() => { const z = tower.get(); return line([EVENT_X, EVENT_Y, z], [EVENT_X, EVENT_Y, z + 14 * flag.get()]); }}
      />
      <Face
        style={{ fill: "var(--iso-accent)", opacity: flag }}
        corners={() => { const z = tower.get(), s = flag.get(); return [[EVENT_X, EVENT_Y, z + 14 * s], [EVENT_X + 10 * s, EVENT_Y, z + 11 * s], [EVENT_X, EVENT_Y, z + 8 * s]]; }}
      />
      {PINS.map((pin) => <Link key={pin.step} {...pin} z={pin === EARLIEST ? rise : 0} />)}
    </IsoStage>
  );
}

function Tile({ col, row }: { col: number; row: number }) {
  const [x, y] = tile(col, row);
  const shown = useTween(1, { delay: 0.1 + 0.04 * (col + row), duration: 0.3 });
  return <Face style={{ stroke: "var(--iso-grid)", opacity: shown }} corners={() => [[x - 10, y - 10, 0], [x + 10, y - 10, 0], [x + 10, y + 10, 0], [x - 10, y + 10, 0]]} />;
}

function Pin({ col, row, h, step, z, singled }: { col: number; row: number; h: number; step: number; z: MotionValue<number> | 0; singled?: MotionValue<number> }) {
  const [x, y] = tile(col, row);
  const height = useTween(h, { delay: pinStart(step) + 0.4 });
  const box = { x: x - 4, y: y - 4, w: 8, d: 8, h: height, z };
  return (
    <>
      <Prism {...box} />
      {singled && <Prism {...box} {...ACCENT} opacity={singled} />}
    </>
  );
}

/** The arc from the event down to a booking; all but the earliest dim once it's singled out. */
function Link({ col, row, h, step, z }: { col: number; row: number; h: number; step: number; z: MotionValue<number> | 0 }) {
  const [x, y] = tile(col, row);
  const draw = useTween(1, { delay: pinStart(step), duration: 0.45 });
  const dim = useTween(step === EARLIEST.step ? 1 : 0.3, { from: 1, delay: FIRST_AT, duration: 0.4 });
  const opacity = useTransform(() => (draw.get() > 0.01 ? 1 : 0) * dim.get());
  return (
    <Path
      draw={draw} style={{ stroke: "var(--iso-accent)", strokeWidth: 1.5, opacity }}
      d={() => arc([EVENT_X, EVENT_Y, TOWER], [x, y, h + read(z)], 16)}
    />
  );
}

/* ---- Share with family ---- */

// Each phone's min corner: 4 wide, 14 deep and 24 tall, its screen on the max-x side.
const PHONES: [number, number][] = [[-76, -7], [-2, -50], [62, -7], [-2, 36]];
const sendAt = (k: number) => 1.1 + 0.55 * k;

function Share({ label }: { label: string }) {
  const float = useLoop(0, 2, { delay: 1.0, duration: 1.8 });
  const bar = useTween(1, { delay: 0.9, duration: 0.3 });
  const barZ = useTransform(() => 14 + float.get()); // on the top sheet
  return (
    <IsoStage label={label} offset={-8}>
      <Floor a={110} b={62} slab={[180, 110]} />
      {PHONES.map(([x, y], k) => <Path key={k} style={{ stroke: "var(--iso-grid)", strokeDasharray: "4 4" }} d={() => line([0, 0, 0], [x + 2, y + 7, 0])} />)}
      {PHONES.map((_, k) => <Arrival key={k} k={k} />)}
      {/* Painter's order: what's behind the hub, the hub, then what's in front of it. */}
      <Phone k={0} />
      <Phone k={1} />
      <Packet k={0} />
      <Packet k={1} />
      {[0, 1, 2].map((i) => <Sheet key={i} i={i} float={float} />)}
      <Prism {...ACCENT} x={-12} y={-12} w={24} d={5} h={1} z={barZ} opacity={bar} />
      <Packet k={2} />
      <Packet k={3} />
      <Phone k={3} />
      <Phone k={2} />
    </IsoStage>
  );
}

function Sheet({ i, float }: { i: number; float: MotionValue<number> }) {
  const delay = 0.1 + 0.15 * i;
  const drop = useTween(5 * i, { from: 5 * i + 30, delay });
  const shown = useTween(1, { delay, duration: 0.2 });
  const z = useTransform(() => drop.get() + float.get());
  return <Prism x={-17} y={-17} w={34} d={34} h={4} z={z} opacity={shown} />;
}

function Phone({ k }: { k: number }) {
  const [x, y] = PHONES[k];
  const height = useTween(24, { delay: 0.3 + 0.12 * k });
  const lit = useTween(1, { delay: sendAt(k) + 0.8, duration: 0.2 });
  // The screen, inset on the max-x side, grows with the phone.
  const screen = () => { const s = height.get() / 24; return [[x + 4, y + 2, 3 * s], [x + 4, y + 12, 3 * s], [x + 4, y + 12, 21 * s], [x + 4, y + 2, 21 * s]] as Point[]; };
  const shown = useTransform((): number => (height.get() < 0.5 ? 0 : 1));
  return (
    <>
      <Prism x={x} y={y} w={4} d={14} h={height} />
      <Face style={{ fill: "var(--iso-left)", opacity: shown }} corners={screen} />
      <Face style={{ fill: "var(--iso-accent)", opacity: lit }} corners={screen} />
    </>
  );
}

/** Where phone `k`'s packet leaves the hub and where it stops, just short of the phone. */
function route(k: number): [Point, Point] {
  const [x, y] = PHONES[k];
  const [cx, cy] = [x + 2, y + 7];
  const length = Math.hypot(cx, cy);
  const [dx, dy] = [cx / length, cy / length];
  const stop = length - (Math.abs(dx) * 2 + Math.abs(dy) * 7 + 5);
  return [[dx * 20, dy * 20, 0], [dx * stop, dy * stop, 0]];
}

/** A packet runs the rail to phone `k`, drawing a trail that stays behind, faint. */
function Packet({ k }: { k: number }) {
  const [from, to] = route(k);
  const t = useTween(1, { delay: sendAt(k), duration: 0.8 });
  const gone = useTween(0, { from: 1, delay: sendAt(k) + 0.8, duration: 0.2 });
  const faded = useTween(0.35, { from: 1, delay: sendAt(k) + 0.8, duration: 0.4 });
  const at = (): Point => { const s = t.get(); return [from[0] + (to[0] - from[0]) * s, from[1] + (to[1] - from[1]) * s, 0]; };
  const started = () => (t.get() > 0.001 ? 1 : 0);
  const trail = useTransform(() => started() * faded.get());
  const packet = useTransform(() => started() * gone.get());
  const x = useTransform(() => at()[0] - 3);
  const y = useTransform(() => at()[1] - 3);
  return (
    <>
      <Path style={{ stroke: "var(--iso-accent)", strokeWidth: 1.5, opacity: trail }} d={() => line(from, at())} />
      <Prism {...ACCENT} x={x} y={y} w={6} d={6} h={6} opacity={packet} />
    </>
  );
}

/** A ring on the floor round phone `k` that spreads and fades once, as its packet lands. */
function Arrival({ k }: { k: number }) {
  const [x, y] = PHONES[k];
  const at = sendAt(k) + 0.8;
  const r = useTween(26, { from: 9, delay: at, duration: 0.7 });
  const fade = useTween(0, { from: 1, delay: at, duration: 0.7 });
  const opacity = useTransform(() => (r.get() > 9.01 ? 1 : 0) * fade.get());
  return <Ring x={x + 2} y={y + 7} r={r} style={{ opacity }} />;
}

/* ---- The card's drawing ---- */

const SCENES = [Budget, BookBy, Share];

export default function IsoScene({ scene, label, live }: { scene: number; label: string; live: boolean }) {
  const Scene = SCENES[scene];
  return (
    // The kit draws with motion's lightweight `m` elements, which need this to render.
    <LazyMotion features={domMin} strict>
      <LiveContext value={live}>
        <Scene label={label} />
      </LiveContext>
    </LazyMotion>
  );
}
