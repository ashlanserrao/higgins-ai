// Appearance: light, dark or auto. A small segmented radio group in the sidebar footer, and a
// bottom sheet on phones (opened from the event switcher). Neutral, never the accent.

import { useId, useRef, type KeyboardEvent } from "react";
import { Check, Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTheme, type ThemePreference } from "@/lib/theme";
import { cn } from "@/lib/utils";

export const THEME_OPTIONS: { value: ThemePreference; label: string; name: string; icon: LucideIcon }[] = [
  { value: "light", label: "Light", name: "Light", icon: Sun },
  { value: "dark", label: "Dark", name: "Dark", icon: Moon },
  { value: "auto", label: "Auto", name: "Auto, follows your device", icon: Monitor },
];

/** Radio-group keys: arrows move the choice (and focus) with wrap-around. */
function useRadioKeys(onChange: (value: ThemePreference) => void) {
  const group = useRef<HTMLDivElement>(null);
  const onKeyDown = (event: KeyboardEvent, index: number) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const next = (index + step + THEME_OPTIONS.length) % THEME_OPTIONS.length;
    onChange(THEME_OPTIONS[next].value);
    group.current?.querySelectorAll<HTMLElement>("[role=radio]")[next]?.focus();
  };
  return { group, onKeyDown };
}

export function AppearanceControl() {
  const { preference, setPreference } = useTheme();
  const { group, onKeyDown } = useRadioKeys(setPreference);
  const label = useId();
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-1.5">
      <span id={label} className="text-sm">Appearance</span>
      <div ref={group} role="radiogroup" aria-labelledby={label} className="flex rounded-full bg-background p-0.5 ring-1 ring-border">
        {THEME_OPTIONS.map(({ value, name, icon: Icon }, index) => {
          const checked = preference === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-label={name}
              title={name}
              tabIndex={checked ? 0 : -1}
              onClick={() => setPreference(value)}
              onKeyDown={(e) => onKeyDown(e, index)}
              className={cn(
                "grid size-8 place-items-center rounded-full text-muted-foreground transition-colors pointer-coarse:size-11",
                checked ? "bg-surface text-foreground shadow-card" : "hover:text-foreground",
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function AppearanceSheet({ open, onOpenChange, onCloseAutoFocus }: {
  open: boolean; onOpenChange: (open: boolean) => void; onCloseAutoFocus?: (event: Event) => void;
}) {
  const { preference, setPreference } = useTheme();
  const { group, onKeyDown } = useRadioKeys(setPreference);
  const title = useId();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onCloseAutoFocus={onCloseAutoFocus}
        className="top-auto bottom-0 left-0 max-w-none translate-x-0 translate-y-0 gap-4 rounded-t-2xl rounded-b-none p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:max-w-none md:p-5"
      >
        <DialogHeader className="text-left">
          <DialogTitle id={title}>Appearance</DialogTitle>
          <DialogDescription>Auto follows your device's light or dark setting.</DialogDescription>
        </DialogHeader>
        <div ref={group} role="radiogroup" aria-labelledby={title} className="grid gap-1">
          {THEME_OPTIONS.map(({ value, name, icon: Icon }, index) => {
            const checked = preference === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={checked}
                tabIndex={checked ? 0 : -1}
                onClick={() => setPreference(value)}
                onKeyDown={(e) => onKeyDown(e, index)}
                className={cn("flex min-h-12 items-center gap-3 rounded-lg px-3 text-left text-base", checked ? "bg-surface-soft font-medium" : "hover:bg-surface-soft")}
              >
                <Icon className="size-5 text-muted-foreground" aria-hidden="true" />
                <span className="flex-1">{name}</span>
                {checked && <Check className="size-5" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
