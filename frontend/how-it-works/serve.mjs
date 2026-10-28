// Minimal static server for the demo: node serve.mjs [port]
// /hm/* comes from ../public/hm/ (what the app serves); everything else from this folder.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = fileURLToPath(new URL(".", import.meta.url));
const HM = fileURLToPath(new URL("../public/hm/", import.meta.url));
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json" };
createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^[\\/]+/, "");
  const file = /^hm[\\/]/.test(path) ? join(HM, path.slice(3)) : join(ROOT, path || "demo/index.html");
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" });
    res.end(body);
  } catch { res.writeHead(404); res.end("not found"); }
}).listen(Number(process.argv[2]) || 8017, () => console.log("serving on", Number(process.argv[2]) || 8017));
