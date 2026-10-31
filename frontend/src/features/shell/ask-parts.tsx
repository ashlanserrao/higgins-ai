// Pieces of the Ask Higgins bar: the "Examples to try" menu above it and the waveform shown
// while the browser listens.

import { cn } from "@/lib/utils";
import type { useExamples } from "./ask-state";
import type { suggestions } from "./ask-words";

/** A menu that drops up from the bar while its field is empty and has the cursor. Pressing on
 *  an example keeps the cursor in the field (no blur), then sends it. */
export function ExamplesMenu({ chips, menu, onPick }: {
  chips: ReturnType<typeof suggestions>;
  menu: Pick<ReturnType<typeof useExamples>, "list" | "onBlur" | "onExampleKey">;
  onPick: (example: string) => void;
}) {
  return (
    <ul
      ref={menu.list} aria-label="Examples to try"
      onBlur={menu.onBlur}
      className="pointer-events-auto mb-2 min-w-56 rounded-xl border bg-popover p-1.5 max-md:w-full [[data-theme=dark]_&]:border-(--hairline-strong)"
    >
      {chips.map(({ icon: Icon, text: example }) => (
        <li key={example}>
          <button
            type="button" tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={() => onPick(example)}
            onKeyDown={menu.onExampleKey}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] outline-none hover:bg-accent focus-visible:bg-accent pointer-coarse:min-h-11"
          >
            <Icon className="size-3.5 shrink-0 text-primary-text" aria-hidden="true" /> {example}
          </button>
        </li>
      ))}
    </ul>
  );
}

// Each bar's height and its place in the wave.
const BARS = [
  "h-3", "h-[19px] [animation-delay:-150ms]", "h-6 [animation-delay:-300ms]", "h-4 [animation-delay:-450ms]",
  "h-[22px] [animation-delay:-600ms]", "h-[13px] [animation-delay:-750ms]", "h-2 [animation-delay:-100ms]",
];

/** Seven bars that rise and fall while the browser listens; still under reduced motion. */
export function Waveform() {
  return (
    <span className="flex h-6 shrink-0 items-center gap-[3px]" aria-hidden="true">
      {BARS.map((bar) => (
        <span key={bar} className={cn("w-[3px] rounded-full bg-primary-text motion-safe:animate-[ask-wave_900ms_ease-in-out_infinite]", bar)} />
      ))}
    </span>
  );
}
