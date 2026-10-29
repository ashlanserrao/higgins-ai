// The coloured band at the top of every page: the event accent behind the page's heading. On a
// desktop it also carries Share and Print (the shell's top bar steps aside there). Whatever comes straight after it rises over its foot (see .page-band in index.css),
// so a page's first card overlaps the band.

import { createContext, useContext, useId, type ReactNode } from "react";

/** The shell's tools for the band (Share, Print); null when the top bar has them. */
export const PageBandTools = createContext<ReactNode>(null);

export function PageBand({ eyebrow, title, description, actions, children }: {
  eyebrow?: ReactNode; title: ReactNode; description?: ReactNode; actions?: ReactNode; children?: ReactNode;
}) {
  const tools = useContext(PageBandTools);
  const titleId = useId();

  return (
    <section aria-labelledby={titleId} className="page-band pt-5 pb-[52px] text-primary-foreground md:pt-6">
      {/* The heading starts at the top of the band; Share and Print sit level with it on the
          right, and the page's own actions under them, level with the description. */}
      <div className="flex flex-col gap-x-6 gap-y-3 md:flex-row md:justify-between">
        <div className="min-w-0">
          {eyebrow && <p className="text-xs text-primary-foreground/80">{eyebrow}</p>}
          <h1 id={titleId} tabIndex={-1} data-section-title className="mt-1.5 text-[clamp(36px,3cqw+14px,56px)] leading-[1.1] tracking-[-0.02em] outline-none">
            {title}
          </h1>
          {description && <p className="mt-1.5 max-w-3xl text-[13px] text-primary-foreground/85">{description}</p>}
        </div>
        {(tools || actions) && (
          <div className="flex shrink-0 flex-col items-start gap-3 md:items-end md:justify-between">
            {tools && <div className="flex items-center gap-2">{tools}</div>}
            {actions && <div className="flex flex-wrap gap-2 md:justify-end">{actions}</div>}
          </div>
        )}
      </div>
      {children}
    </section>
  );
}
