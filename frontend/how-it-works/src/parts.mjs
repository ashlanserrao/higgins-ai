// Shared part builders. Every function returns SVG strings for static art, drawn
// with the Anatomy kit, in world units (x, y on the floor, z up).
import * as k from "../kit/iso-kit.mjs";
import * as G from "../kit/lathe.mjs";

export { k, G };

const esc = (text) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const f1 = (v) => Math.round(v * 100) / 100;

export function partsFor(P) {
  const at = (p) => k.iso(p, P);
  const S = (paths, style) => k.solidSvg(paths, style);
  const L = (d, style) => k.lineSvg(d, style);
  const Dt = (points, style) => k.dotsSvg(points, style);
  const depth = (p) => k.depthOf(p, P);
  const items = [];
  const put = (p, svg, bias = 0) => items.push({ key: depth(p) + bias, svg });
  const mat = (cls, inner) => `<g class="${cls}">${inner}</g>`;
  // Face planes: +y faces read left to right along +x; +x faces along -y.
  const faceY = (x0, y, zTop, inner, extra = "") => `<g transform="${k.sideMatrix([x0, y], zTop, P, "left")}"${extra}>${inner}</g>`;
  const faceX = (x, y0, zTop, inner, extra = "") => `<g transform="${k.sideMatrix([x, y0], zTop, P, "right")}"${extra}>${inner}</g>`;
  const top = (x0, y0, z, inner, extra = "") => `<g transform="${k.topMatrix([x0, y0], z, P, "x")}"${extra}>${inner}</g>`;
  const text = (x, y, str, { size = 4, anchor = "middle", tone = "hi", cls = "", weight } = {}) =>
    `<text class="iso-face-text${cls ? " " + cls : ""}" data-tone="${tone}" x="${f1(x)}" y="${f1(y)}" font-size="${size}" text-anchor="${anchor}"${weight ? ` font-weight="${weight}"` : ""}>${esc(str)}</text>`;
  const rect = (x, y, w, h, cls, r = 0, extra = "") => `<rect class="${cls}" x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="${f1(h)}" rx="${r}"${extra}/>`;
  const halo = (plan, z, h) => `<path class="iso-halo" d="${k.haloOf(plan, z, h, P)}"/>`;
  const slab = (plan, z, h, style = {}, steps = 4, bevel = 0.5) => S(k.slabOf(plan, z, h, P, steps, bevel), style);
  const cyl = (x, y, r, z, h, style = {}, steps = 28, bevel = 0) => S(k.cylinder(x, y, r, z, h, P, steps, bevel), style);
  const screws = (points, size = 0.5, tone = "mid") => Dt(points.map(at), { size, tone });
  const byDepth = (points) => [...points].sort((a, b) => depth([a[0], a[1], 0]) - depth([b[0], b[1], 0]));

  // A base plate on round feet, with a groove, corner screws and a label plate.
  function basePlate(plan, { h = 10, foot = 5, footInset = 22, feet } = {}) {
    const out = [halo(plan, -h - foot, h)];
    for (const [x, y] of byDepth(feet ?? k.corners(plan, footInset))) {
      out.push(cyl(x, y, 7, -h - foot, 1.6, { tone: "lo" }));
      out.push(cyl(x, y, 5.4, -h - foot + 1.6, foot - 1.6, { tone: "mid" }));
    }
    out.push(slab(plan, -h, h, { tone: "mid" }, 8, 1.6));
    out.push(L(k.planOutline(k.insetPlan(plan, 5), 0, P), { tone: "lo" }));
    const sc = k.corners(plan, 10);
    out.push(L(sc.map(([x, y]) => k.ring(x, y, 2.2, 0, P, 16)).join(""), { tone: "lo" }));
    out.push(screws(sc.map(([x, y]) => [x, y, 0])));
    return out.join("");
  }

  // A label plate with three rule lines that stand for printed text.
  function labelPlate(plan, z) {
    const out = [slab(plan, z, 0.8, { tone: "lo" }, 3, 0.3)];
    out.push(L(k.planOutline(k.insetPlan(plan, 1.4), z + 0.8, P, 3), { tone: "faint" }));
    const y0 = plan.y + plan.d / 2;
    const rows = [[-3, 0.72], [0, 0.5], [3, 0.62]];
    out.push(L(rows.map(([dy, share]) => k.lineOnTop([plan.x + 4, y0 + dy], [plan.x + 4 + (plan.w - 8) * share, y0 + dy], z + 0.8, P)).join(""), { tone: "lo", free: true }));
    out.push(screws([[plan.x + plan.w - 3, plan.y + 2.6, z + 0.8], [plan.x + plan.w - 3, plan.y + plan.d - 2.6, z + 0.8]], 0.42));
    return out.join("");
  }

  // A ruler strip with ticks rooted on its back edge.
  function ruler(strip, z, step, every) {
    const out = [slab(strip, z, 0.6, { tone: "lo", crease: "none" }, 3, 0)];
    const t = k.topTicks(strip.x + 2, strip.x + strip.w - 2 + 0.01, step, every, strip.y, z + 0.6, [1.8, 3.4], P);
    out.push(L(t.minor, { tone: "lo" }), L(t.major, { tone: "mid" }));
    return out.join("");
  }

  // A coin standing on edge, facing +y, built at the world origin; the page translates it.
  function coin(r = 3.1, t = 0.9) {
    const F = G.frameOf([0, 0, 0], [0, 1, 0], [1, 0, 0], [0, 0, 1]);
    const body = S(G.disc(-t / 2, t / 2, r, F, P, { steps: 28 }), { tone: "hi" });
    const ring = L(G.circleOf(F, t / 2, r - 0.7, P, 24), { tone: "lo" });
    return mat("hm-gold", body + ring);
  }

  // Convex screen hull of world points, for hit areas.
  const hullOf = (points) => G.hullOf(points.map(at));
  const hullPath = (points) => k.pathOf(hullOf(points), true);
  const box = (x0, y0, z0, x1, y1, z1) => [[x0, y0, z0], [x1, y0, z0], [x0, y1, z0], [x1, y1, z0], [x0, y0, z1], [x1, y0, z1], [x0, y1, z1], [x1, y1, z1]];

  return { k, P, at, S, L, Dt, depth, items, put, mat, faceY, faceX, top, text, rect, halo, slab, cyl, screws, byDepth, basePlate, labelPlate, ruler, coin, hullOf, hullPath, box, f1 };
}

// Coin kinematics, worked out once at build time. A coin rolls down each chute segment at
// a = 2/3 g sin(slope) (a rolling disc), falls onto the next segment's top end losing most of
// its speed, and on the last segment drops through its tank's gate. Returns positions at 60 Hz
// and the time each gate is reached.
export function coinRoute(segments, gates, { v0 = 34, g = 2450, r = 3.1 } = {}) {
  const centre = (seg, s) => G.add3(G.add3(seg.o, G.mul3(seg.a, s)), G.mul3(seg.v, r));
  const pts = [];
  const gateT = gates.map(() => null);
  const dt = 1 / 240;
  let t = 0, i = 0, s = seg0Start(segments[0]), v = v0, falling = null;
  function seg0Start(seg) { return seg.start ?? 0; }
  for (let n = 0; n < 240 * 4; n++) {
    const seg = segments[i];
    let p;
    if (falling) {
      falling.t += dt;
      const u = Math.min(1, falling.t / falling.T);
      p = [falling.from[0] + (falling.to[0] - falling.from[0]) * u, falling.from[1] + (falling.to[1] - falling.from[1]) * u, falling.from[2] + (falling.to[2] - falling.from[2]) * (u * u)];
      if (u >= 1) { falling = null; i++; s = 0; v *= 0.35; }
    } else {
      const acc = (2 / 3) * g * Math.max(0, -seg.a[2]);
      v += acc * dt; s += v * dt;
      if (i === segments.length - 1) gates.forEach((gs, j) => { if (gateT[j] === null && s >= gs) gateT[j] = t; });
      if (s >= seg.len) {
        if (i === segments.length - 1) { s = seg.len; if (gateT.every((x) => x !== null)) { p = centre(seg, s); pts.push([...p, i]); break; } }
        else {
          const from = centre(seg, seg.len), to = centre(segments[i + 1], 0);
          falling = { from, to, t: 0, T: Math.sqrt((2 * Math.max(1, from[2] - to[2])) / g) };
        }
      }
      p = centre(seg, Math.min(s, seg.len));
    }
    if (n % 4 === 0) pts.push([...p.map((x) => Math.round(x * 100) / 100), falling ? (falling.t / falling.T < 0.97 ? i : i + 1) : i]);
    t += dt;
    if (gateT.every((x) => x !== null) && !falling && i === segments.length - 1 && s > Math.max(...gates) + 2) break;
  }
  return { dt: 1 / 60, pts, gateT: gateT.map((x) => Math.round(x * 1000) / 1000), gatePts: gates.map((gs) => centre(segments[segments.length - 1], gs)) };
}
