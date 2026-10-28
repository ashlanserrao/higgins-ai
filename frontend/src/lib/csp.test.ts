/// <reference types="node" />
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { expect, it } from "vitest";

// The backend's CSP allows Radix Select's one <style> by hash (app/security.py). If a Radix
// upgrade changes that text, the browser blocks it again; this says so before users see it.
it("lists the hash of Radix Select's <style> in the CSP", () => {
  const select = createRequire(import.meta.url).resolve("@radix-ui/react-select");
  const css = readFileSync(select, "utf8").match(/__html: `([^`]*data-radix-select-viewport[^`]*)`/)?.[1];
  expect(css, "Radix Select no longer renders its viewport <style>").toBeDefined();
  const hash = `sha256-${createHash("sha256").update(css!).digest("base64")}`;
  const security = readFileSync(path.resolve(import.meta.dirname, "../../../app/security.py"), "utf8");
  expect(security, `update RADIX_SELECT_STYLE_HASH in app/security.py to '${hash}'`).toContain(hash);
});
