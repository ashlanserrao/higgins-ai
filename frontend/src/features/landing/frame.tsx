// The landing page's drafted frame: one pair of side hairlines running from the hero to the
// footer, dashed rules between sections with a "+" where they cross those lines, and strips
// of cells divided by hairlines. All of it is decoration, hidden from assistive tech.

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** The one container from the top of the page to the footer; its side borders are the page's
 *  side lines. */
export function Frame({ children }: { children: ReactNode }) {
  return <div className="frame">{children}</div>;
}

/** A 15px "+" whose canvas-coloured square masks the lines crossing behind it. */
export function Crosshair({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 15 15" width="15" height="15" aria-hidden="true" focusable="false" className={cn("crosshair", className)}>
      <path d="M7.5 0v15M0 7.5h15" stroke="currentColor" strokeWidth="1" fill="none" />
    </svg>
  );
}

/** A dashed rule between sections (solid under the header), out to the viewport edges, crossed
 *  on both side lines. */
export function SectionRule({ solid = false }: { solid?: boolean }) {
  return (
    <div className={cn("section-rule", solid && "section-rule-solid")} aria-hidden="true">
      <span className="section-rule-line" />
      <Crosshair className="crosshair-start" />
      <Crosshair className="crosshair-end" />
    </div>
  );
}

/** A vertical hairline down the middle of a two-column section (no crosshairs: those mark the
 *  side lines only). Its section needs `relative`. */
export function CenterLine() {
  return <div className="center-line" aria-hidden="true" />;
}

/** A strip of cells. The 1px gaps show the hairline colour, so dividers follow any column count.
 *  A list by default (`ol` for steps); `div` when the cells aren't items of one kind. */
export function CellGrid({ as: Tag = "ul", className, children }: { as?: "ul" | "ol" | "div"; className?: string; children: ReactNode }) {
  return <Tag role={Tag === "div" ? undefined : "list"} className={cn("cell-grid grid", className)}>{children}</Tag>;
}

/** `reveal` fades the cell's contents in on first scroll (see reveal.ts); the cell's own
 *  background stays put so the hairline grid behind it never shows through. */
export function Cell({ as: Tag = "li", reveal = false, className, children }: {
  as?: "li" | "div";
  reveal?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return <Tag data-reveal={reveal ? "children" : undefined} className={cn("bg-canvas", className)}>{children}</Tag>;
}
