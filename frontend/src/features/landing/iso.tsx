// A small isometric drawing kit for the "what you get" scenes (iso-scenes.tsx): a 30° projection,
// flat-shaded prisms and two hooks to move them. Pure SVG, coloured only by the --iso-* tokens in
// index.css, so it follows the theme and the event accent. Geometry is in world units: x runs to
// the lower right, y to the lower left, z up.

import { createContext, useContext, useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { animate, useMotionValue, useReducedMotion, useTransform, type AnimationPlaybackControls, type MotionValue } from "motion/react";
import * as m from "motion/react-m";

export type Num = number | MotionValue<number>;
export type Point = [x: number, y: number, z: number];

const COS30 = Math.cos(Math.PI / 6);
// Every delay and duration is stretched by TEMPO, so the scenes keep their timing relative to
// each other at any speed. The spring slows to match: stiffness by TEMPO², damping by TEMPO, so
// it settles TEMPO times slower with the same overshoot.
const TEMPO = 1.6;
const SPRING = { type: "spring", stiffness: 170 / TEMPO ** 2, damping: 15 / TEMPO, mass: 0.8 } as const;

export const read = (value: Num) => (typeof value === "number" ? value : value.get());

/** World to screen: no perspective, so parallel edges stay parallel. */
export function project([x, y, z]: Point) {
  return `${Math.round((x - y) * COS30 * 100) / 100},${Math.round(((x + y) / 2 - z) * 100) / 100}`;
}

/** A path through world points: straight segments, or one arc that rises `lift` at its middle. */
export function line(from: Point, to: Point) {
  return `M${project(from)} L${project(to)}`;
}
export function arc(from: Point, to: Point, lift: number) {
  const control: Point = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2 + lift * 2];
  return `M${project(from)} Q${project(control)} ${project(to)}`;
}

/** The accent's three faces: lit from the top, darker down the sides. */
export const ACCENT = { top: "var(--iso-accent)", left: "var(--iso-accent-left)", right: "var(--iso-accent-right)" };

/** False while the scene is off screen, so looping motion holds still. */
export const LiveContext = createContext(true);

/** A value that moves from `from` to `to` once, after `delay` seconds: a springy settle by
 *  default, a smooth ease when given a `duration`. Reduced motion lands on `to` at once. */
export function useTween(to: number, { from = 0, delay = 0, duration }: { from?: number; delay?: number; duration?: number } = {}) {
  const reduce = useReducedMotion();
  const value = useMotionValue(reduce ? to : from);
  useEffect(() => {
    if (reduce) {
      value.jump(to);
      return;
    }
    const controls = animate(value, to, duration
      ? { delay: delay * TEMPO, duration: duration * TEMPO, ease: "easeInOut" }
      : { delay: delay * TEMPO, ...SPRING });
    return () => controls.stop();
  }, [value, to, delay, duration, reduce]);
  return value;
}

/** A value that drifts between `from` and `to` and back for as long as the scene is on screen.
 *  Reduced motion holds it at `from`. */
export function useLoop(from: number, to: number, { delay = 0, duration = 1.6 } = {}) {
  const reduce = useReducedMotion();
  const live = useContext(LiveContext);
  const value = useMotionValue(from);
  const controls = useRef<AnimationPlaybackControls | null>(null);
  useEffect(() => {
    if (reduce) return;
    controls.current = animate(value, [from, to], {
      delay: delay * TEMPO, duration: duration * TEMPO, ease: "easeInOut", repeat: Infinity, repeatType: "mirror",
    });
    return () => controls.current?.stop();
  }, [value, from, to, delay, duration, reduce]);
  useEffect(() => {
    if (live) controls.current?.play();
    else controls.current?.pause();
  }, [live]);
  return value;
}

/** The drawing's canvas: 320 x 240, scaled to its box, with the scene nudged `offset` down so it
 *  sits in the middle. */
export function IsoStage({ label, offset = 0, children }: { label: string; offset?: number; children: ReactNode }) {
  return (
    <svg
      viewBox="-160 -120 320 240" role="img" aria-label={label} className="iso-stage block h-auto w-full"
      fill="none" stroke="var(--iso-ink)" strokeWidth={1.2} strokeLinejoin="round" strokeLinecap="round"
    >
      <g transform={`translate(0 ${offset})`}>{children}</g>
    </svg>
  );
}

/** One flat polygon through world points, recomputed whenever a motion value it reads changes
 *  (so `corners` must read the same values on every call). */
export function Face({ corners, style }: { corners: () => Point[]; style?: Omit<CSSProperties, "opacity"> & { opacity?: Num } }) {
  const points = useTransform(() => corners().map(project).join(" "));
  return <m.polygon points={points} style={style} />;
}

/** A path, like Face; `draw` (0 to 1) reveals it from its start. */
export function Path({ d, draw, style }: { d: () => string; draw?: MotionValue<number>; style?: Omit<CSSProperties, "opacity"> & { opacity?: Num } }) {
  const path = useTransform(d);
  return <m.path d={path} pathLength={draw} style={style} />;
}

/** A box seen from above: its top, its max-y side (on the left) and its max-x side (on the
 *  right). Hidden while it is flatter than half a unit. */
export function Prism({ x, y, w, d, h, z = 0, opacity = 1, top = "var(--iso-top)", left = "var(--iso-left)", right = "var(--iso-right)" }: {
  x: Num; y: Num; w: number; d: number; h: Num; z?: Num; opacity?: Num;
  top?: string; left?: string; right?: string;
}) {
  const shown = useTransform(() => {
    const o = read(opacity); // read every input up front: a computed value tracks only what it reads
    return read(h) < 0.5 ? 0 : o;
  });
  const box = () => {
    const x0 = read(x), y0 = read(y), z0 = read(z), z1 = z0 + read(h);
    return { x0, y0, z0, z1, x1: x0 + w, y1: y0 + d };
  };
  return (
    <m.g style={{ opacity: shown }}>
      <Face style={{ fill: left }} corners={() => { const b = box(); return [[b.x0, b.y1, b.z0], [b.x1, b.y1, b.z0], [b.x1, b.y1, b.z1], [b.x0, b.y1, b.z1]]; }} />
      <Face style={{ fill: right }} corners={() => { const b = box(); return [[b.x1, b.y0, b.z0], [b.x1, b.y1, b.z0], [b.x1, b.y1, b.z1], [b.x1, b.y0, b.z1]]; }} />
      <Face style={{ fill: top }} corners={() => { const b = box(); return [[b.x0, b.y0, b.z1], [b.x1, b.y0, b.z1], [b.x1, b.y1, b.z1], [b.x0, b.y1, b.z1]]; }} />
    </m.g>
  );
}

/** The ground: a dashed boundary (`a` x `b` half-extents) at z = -8, and an 8-high slab
 *  (`slab` = width x depth) the scene stands on, both centred. */
export function Floor({ a, b, slab: [w, d] }: { a: number; b: number; slab: [number, number] }) {
  return (
    <>
      <Face style={{ stroke: "var(--iso-grid)", strokeDasharray: "4 4" }} corners={() => [[a, b, -8], [a, -b, -8], [-a, -b, -8], [-a, b, -8]]} />
      <Prism x={-w / 2} y={-d / 2} w={w} d={d} h={8} z={-8} />
    </>
  );
}

/** A dashed square on the floor around (`x`, `y`), `r` half its side: a diamond on screen. */
export function Ring({ x, y, r, style }: { x: number; y: number; r: Num; style?: Omit<CSSProperties, "opacity"> & { opacity?: Num } }) {
  return (
    <Face
      style={{ stroke: "var(--iso-accent)", strokeDasharray: "4 4", ...style }}
      corners={() => { const s = read(r); return [[x - s, y - s, 0], [x + s, y - s, 0], [x + s, y + s, 0], [x - s, y + s, 0]]; }}
    />
  );
}
