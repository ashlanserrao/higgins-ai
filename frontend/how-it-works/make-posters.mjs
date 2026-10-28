// node make-posters.mjs  (with `node serve.mjs` running)  ->  ../public/hm/poster.html and the PNGs
//
// The posters are committed artifacts: `npm run build:hm` doesn't touch them. Regenerating them
// needs the anatomy skill's headless-browser driver (drive.mjs and capture.mjs), which is not in
// this repo. Point ANATOMY_SCRIPTS at the folder that holds them.
//
// The poster is the machine's finished state, frozen: same markup and styles, no script,
// no hit areas, so it follows the page's tokens (theme and event accent) like the live one.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "public", "hm");
const SCRIPTS = process.env.ANATOMY_SCRIPTS;
if (!SCRIPTS || !existsSync(join(SCRIPTS, "drive.mjs"))) {
  console.error("Set ANATOMY_SCRIPTS to the folder with the anatomy skill's drive.mjs and capture.mjs.");
  process.exit(1);
}
const DRIVE = join(SCRIPTS, "drive.mjs");
const CAPTURE = join(SCRIPTS, "capture.mjs");
const BASE = process.env.HM_URL || "http://localhost:8017";
const CSS = readFileSync(join(HERE, "src", "machine.css"), "utf8");

const freeze = `(() => {
  const card = document.querySelector('.hm-card').cloneNode(true);
  card.querySelectorAll('.hm-hits, .hm-tip, [data-live]').forEach((n) => n.remove());
  const svg = card.querySelector('svg.hm-live');
  const alt = card.querySelector('.hm-sr').textContent;
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', alt);
  svg.removeAttribute('aria-labelledby');
  svg.removeAttribute('aria-describedby');
  card.querySelector('.hm-sr').remove();
  card.querySelector('[data-corner="hint"]').textContent = 'The finished example';
  card.querySelectorAll('[data-coin]').forEach((n) => n.remove());
  return card.outerHTML;
})()`;

const run = spawnSync(process.execPath, [DRIVE, `${BASE}/demo/test-light.html?finish=1`, JSON.stringify([["wait", 1200], ["eval", freeze]])], { encoding: "utf8", maxBuffer: 64 << 20 });
const line = run.stdout.split("\n").find((l) => l.startsWith("eval: "));
if (!line) throw new Error(run.stdout + run.stderr);
const html = JSON.parse(line.slice(6));
writeFileSync(join(OUT, "poster.html"), `<style>${CSS}</style>${html}`);
console.log("poster.html", (html.length / 1024).toFixed(0), "KB");
for (const theme of ["light", "dark"]) {
  spawnSync(process.execPath, [CAPTURE, `${BASE}/demo/test-${theme}.html?finish=1&hits=0`, "--select", ".hm-card", "--out", join(OUT, `poster-${theme}.png`), "--scale", "1", "--width", "1280", "--wait", "1200"], { stdio: "inherit" });
}
