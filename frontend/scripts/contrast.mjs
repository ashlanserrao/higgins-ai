// WCAG AA check for every text/background token pair, in both themes and all three event
// accents. Reads the tokens straight from src/index.css, prints a table and exits 1 on a
// failure. Usage: npm run contrast

import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../src/index.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const blocks = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({
  selector: selector.split(";").pop().trim().replace(/\s+/g, " "), // drop @import lines before the first rule
  vars: Object.fromEntries([...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(([, k, v]) => [k, v.trim()])),
}));
const merge = (match) => Object.assign({}, ...blocks.filter((b) => match(b.selector)).map((b) => b.vars));

const EVENTS = ["wedding", "birthday", "community"];
const lightBase = merge((s) => s === ":root");
const darkBase = merge((s) => s === ':root[data-theme="dark"]');
const tokens = (theme, event) => {
  const light = { ...lightBase, ...merge((s) => s.includes(`[data-event="${event}"]`) && !s.includes("data-theme")) };
  if (theme === "light") return light;
  return { ...light, ...darkBase, ...merge((s) => s.includes(`[data-theme="dark"] [data-event="${event}"]`)) };
};

const resolve = (vars, value, depth = 0) => {
  const ref = value?.match(/^var\((--[\w-]+)\)$/);
  return ref && depth < 10 ? resolve(vars, vars[ref[1]], depth + 1) : value;
};
const luminance = (hex) => {
  const n = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.length === 3 ? n[i / 2].repeat(2) : n.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// [foreground, background, minimum, what it is]
const SURFACES = ["--bg-canvas", "--bg-surface", "--bg-surface-soft"];
const PAIRS = [
  ...["--text-primary", "--text-secondary", "--text-tertiary"].flatMap((fg) => SURFACES.map((bg) => [fg, bg, 4.5, "text"])),
  ["--accent-text", "--bg-surface", 4.5, "accent as text"],
  ["--accent-text", "--bg-canvas", 4.5, "accent as text"],
  ["--accent-text", "--bg-surface-soft", 4.5, "active nav, links"],
  ["--accent-ink", "--accent-soft", 4.5, "ink on accent tint"],
  ["--primary-foreground", "--accent", 4.5, "filled button"],
  ["--primary-foreground", "--accent-hover", 4.5, "filled button, hover"],
  ["--accent-text", "--bg-surface", 3, "accent edge (selected card, step bar)"],
  ["--ring", "--bg-surface", 3, "focus ring"],
  ["--ring", "--bg-surface-soft", 3, "focus ring"],
  ["--border-strong", "--bg-surface", 3, "field edge"],
  ["--border-strong", "--bg-surface-soft", 3, "field edge"],
  ...["urgent", "warning", "success", "info"].flatMap((name) => [
    [`--${name}`, `--${name}-soft`, 4.5, `${name} badge`],
    [`--${name}`, "--bg-surface", 4.5, `${name} text`],
  ]),
  ["--primary-foreground", "--destructive", 4.5, "delete button"],
  ["--ai", "--ai-soft", 4.5, "AI card text"],
  ["--ai", "--ai-tint", 4.5, "AI chip"],
  ["--ai", "--bg-surface", 4.5, "AI text"],
  ["--primary-foreground", "--ai-solid", 4.5, "filled AI button"],
  ["--primary-foreground", "--ai-solid-hover", 4.5, "filled AI button, hover"],
  // The chart is decorative (the table beside it carries the numbers): reported, never failing.
  ...Array.from({ length: 9 }, (_, i) => [`--chart-${i + 1}`, "--bg-surface", 3, "chart slice", "note"]),
];

let failures = 0;
const rows = [];
for (const theme of ["light", "dark"]) {
  for (const event of EVENTS) {
    const vars = tokens(theme, event);
    for (const [fg, bg, min, what, kind] of PAIRS) {
      const [a, b] = [resolve(vars, vars[fg]), resolve(vars, vars[bg])];
      if (!/^#[0-9a-f]{3,6}$/i.test(a ?? "") || !/^#[0-9a-f]{3,6}$/i.test(b ?? "")) {
        console.error(`Can't check ${fg} on ${bg} (${theme}, ${event}): ${a} / ${b}`);
        failures++;
        continue;
      }
      const r = ratio(a, b);
      const ok = r >= min;
      if (!ok && kind !== "note") failures++;
      // Base pairs don't change with the event: print them once per theme.
      const perEvent = /accent|ring|primary-foreground/.test(fg + bg);
      if (perEvent || event === "wedding" || !ok) rows.push([theme, perEvent ? event : "all", what, `${fg} on ${bg}`, `${a} / ${b}`, r.toFixed(2), min, ok ? "pass" : kind === "note" ? "note" : "FAIL"]);
    }
  }
}

const head = ["theme", "event", "use", "pair", "colours", "ratio", "min", "result"];
const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)));
const line = (cells) => cells.map((c, i) => String(c).padEnd(widths[i])).join("  ");
console.log(line(head));
console.log(widths.map((w) => "-".repeat(w)).join("  "));
for (const row of rows) console.log(line(row));
const notes = rows.filter((row) => row[7] === "note").length;
console.log(`\n${failures ? `${failures} pair(s) below AA` : "Every text and control pair meets WCAG AA"} (${rows.length} shown${notes ? `, ${notes} decorative notes` : ""}).`);
process.exit(failures ? 1 : 0);
