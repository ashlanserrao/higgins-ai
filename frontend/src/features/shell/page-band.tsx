// The coloured band at the top of every page: the event accent behind the page's heading. On a
// desktop it also carries the command bar, Share and Print (the shell's top bar steps aside
// there). Whatever comes straight after it rises over its foot (see .page-band in index.css),
// so a page's first card overlaps the band.

import { useId, type ReactNode } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DESKTOP, useMediaQuery } from "@/lib/use-media-query";
import { usePlan } from "@/state/planner";
import { CommandBar } from "./command-bar";
import { ShareButton, usePrint } from "./shell";

export function PageBand({ eyebrow, title, description, actions, children }: {
  eyebrow?: ReactNode; title: ReactNode; description?: ReactNode; actions?: ReactNode; children?: ReactNode;
}) {
  const { activeId } = usePlan();
  const desktop = useMediaQuery(DESKTOP);
  const print = usePrint();
  const titleId = useId();

  return (
    <section aria-labelledby={titleId} className="page-band pt-5 pb-[52px] text-primary-foreground md:pt-6">
      {desktop && (
        <div className="no-print mb-6 flex items-center gap-2">
          {/* A fresh bar per event, so a half-typed change never applies to another one. */}
          <div className="min-w-0 flex-1"><CommandBar key={activeId} tone="band" /></div>
          <ShareButton tone="band" />
          <Button
            variant="ghost" size="icon" onClick={print} aria-label="Print or save as PDF" title="Print or save as PDF"
            className="text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground"
          >
            <Printer aria-hidden="true" />
          </Button>
        </div>
      )}
      <div className="flex flex-col gap-x-6 gap-y-3 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          {eyebrow && <p className="text-xs text-primary-foreground/80">{eyebrow}</p>}
          {/* Two pixels under the Overview's figures at every width, so the numbers stay dominant. */}
          <h1 id={titleId} tabIndex={-1} data-section-title className="mt-1.5 text-[clamp(28px,2.4cqw+8px,42px)] leading-tight tracking-[-0.02em] outline-none">
            {title}
          </h1>
          {description && <p className="mt-1 max-w-3xl text-[13px] text-primary-foreground/85">{description}</p>}
        </div>
        {actions && <div className="no-print flex shrink-0 flex-wrap gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}
