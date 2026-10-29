// An odometer figure for the Overview band: each digit is a wheel that rolls into place, the
// left ones landing first, all within two seconds. When the figure first shows (load, an
// event switch, coming back to the Overview) every wheel rolls up from 0; when it changes, only
// the digits that differ roll on to their new ones. ₹, commas and words stay still.
// Reduced motion: the figure is simply shown. Screen readers get the plain text.

import { useLayoutEffect, useRef } from "react";

const ROLL_MS = 1400;
const STAGGER_MS = 600; // spread across the wheels, left to right: the last lands at 2 s
const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";
const WHEEL = [..."01234567890123456789"]; // two turns, so every roll can go upward
const at = (index: number) => `translateY(${-index * (100 / WHEEL.length)}%)`;
const digitsOf = (text: string) => text.replace(/\D/g, "");

export function Odometer({ value }: { value: string }) {
  const wheels = useRef<HTMLSpanElement>(null);
  const shown = useRef<string | null>(null); // the digits on the wheels; null before the first roll

  // Before paint, so a wheel is never seen at the wrong digit. Inline styles set from script
  // (not style attributes in markup), which the CSP allows.
  useLayoutEffect(() => {
    const columns = [...(wheels.current?.querySelectorAll<HTMLElement>("[data-digit]") ?? [])];
    const before = shown.current;
    shown.current = digitsOf(value);
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    columns.forEach((column, i) => {
      const to = Number(column.dataset.digit);
      // Matched from the right, so ₹9,99,000 → ₹10,20,000 lines up its units.
      const fromRight = columns.length - 1 - i;
      const from = before === null ? 0 : Number(before[before.length - 1 - fromRight] ?? 0);
      column.style.transition = "none";
      if (still || (before !== null && from === to)) {
        column.style.transform = at(to);
        return;
      }
      column.style.transform = at(from);
      void column.offsetHeight; // settle on `from` before rolling
      column.style.transition = `transform ${ROLL_MS}ms ${EASE} ${(i / Math.max(1, columns.length - 1)) * STAGGER_MS}ms`;
      column.style.transform = at(WHEEL.length / 2 + to);
    });
  }, [value]);

  const count = digitsOf(value).length;
  let seen = 0;
  return (
    <>
      <span className="sr-only">{value}</span>
      <span ref={wheels} aria-hidden="true" className="select-none">
        {[...value].map((char, i) => {
          if (!/\d/.test(char)) return <span key={`c${i}`}>{char}</span>;
          // Keyed by place from the right, so a wheel keeps its place when the figure grows.
          const place = count - 1 - seen++;
          return (
            <span key={`d${place}`} className="inline-block h-[1lh] overflow-hidden align-top">
              <span data-digit={char} className="flex flex-col will-change-transform">
                {WHEEL.map((digit, j) => <span key={j} className="h-[1lh]">{digit}</span>)}
              </span>
            </span>
          );
        })}
      </span>
    </>
  );
}
