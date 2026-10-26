// The landing page's static sections: the event-type strip, what you get, how it works and the
// sample plan. Each sits between SectionRules inside the Frame (see landing.tsx).

import { Cake, CalendarCheck, Heart, IndianRupee, Share2, Users, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { COPY } from "./copy";
import { Cell, CellGrid, Crosshair } from "./frame";

/** Side padding for everything in the frame: 16px on phones, 24px on tablets, 48px on desktop. */
export const PAD = "px-4 md:px-6 lg:px-12";

const EVENT_ICONS: LucideIcon[] = [Heart, Cake, Users];
const VALUE_ICONS: LucideIcon[] = [IndianRupee, CalendarCheck, Share2];

/** Eyebrow and headline on the left (7/12), a supporting paragraph on the right (4/12), sharing a
 *  bottom edge. Stacked below 1024px. */
export function SectionIntro({ id, eyebrow, title, body }: { id: string; eyebrow: string; title: string; body?: string }) {
  return (
    <div className={cn("grid gap-y-4 py-14 lg:grid-cols-12 lg:items-end lg:py-24", PAD)}>
      <div data-reveal className="lg:col-span-7">
        <p className="eyebrow">{eyebrow}</p>
        <h2 id={id} className="headline mt-3 text-3xl leading-[1.08] md:text-4xl lg:text-[2.75rem]">{title}</h2>
      </div>
      {body && <p data-reveal className="lede lg:col-span-4 lg:col-start-9">{body}</p>}
    </div>
  );
}

export function PlanForStrip() {
  return (
    <section aria-label={COPY.planFor.sectionLabel}>
      <CellGrid className="grid-cols-2 lg:grid-cols-4">
        <Cell reveal className={cn("flex items-center py-6 lg:py-8", PAD)}>
          <span className="text-sm text-muted-foreground">{COPY.planFor.label}</span>
        </Cell>
        {COPY.planFor.items.map((name, index) => {
          const Icon = EVENT_ICONS[index];
          return (
            <Cell key={name} reveal className={cn("flex items-center gap-3 py-6 lg:py-8", PAD)}>
              <Icon className="size-5 shrink-0 text-primary-ink" aria-hidden="true" />
              <span className="font-display text-lg">{name}</span>
            </Cell>
          );
        })}
      </CellGrid>
    </section>
  );
}

export function WhatYouGet() {
  return (
    <section aria-labelledby="what-title">
      <SectionIntro id="what-title" eyebrow={COPY.values.eyebrow} title={COPY.values.title} body={COPY.values.body} />
      <CellGrid className="grid-cols-1 border-t border-hairline md:grid-cols-3">
        {COPY.values.items.map(({ title, body }, index) => {
          const Icon = VALUE_ICONS[index];
          return (
            <Cell key={title} reveal className={cn("py-8 lg:py-10", PAD)}>
              <Icon className="size-6 text-primary-ink" aria-hidden="true" />
              <h3 className="mt-4 text-lg">{title}</h3>
              <p className="lede mt-1.5">{body}</p>
            </Cell>
          );
        })}
      </CellGrid>
    </section>
  );
}

export function HowItWorks() {
  return (
    <section id="how" tabIndex={-1} aria-labelledby="how-title" className="scroll-mt-6 outline-none md:scroll-mt-20">
      <SectionIntro id="how-title" eyebrow={COPY.steps.eyebrow} title={COPY.steps.title} />
      {/* An ordered list already says "1 of 3", so the printed index is for sighted readers only. */}
      <CellGrid as="ol" className="grid-cols-1 border-t border-hairline md:grid-cols-3">
        {COPY.steps.items.map(({ title, body }, index) => (
          <Cell key={title} reveal className={cn("py-8 lg:py-10", PAD)}>
            <span className="num text-sm text-tertiary" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
            <h3 className="mt-4 text-lg">{title}</h3>
            <p className="lede mt-1.5">{body}</p>
          </Cell>
        ))}
      </CellGrid>
    </section>
  );
}

export function SamplePlan() {
  return (
    <section id="sample" tabIndex={-1} aria-labelledby="sample-title" className="scroll-mt-6 pb-14 outline-none md:scroll-mt-20 lg:pb-24">
      <SectionIntro id="sample-title" eyebrow={COPY.sample.title} title={COPY.sample.caption} />
      <div className={PAD}>
        {/* A hairline panel with a "+" on each corner. The preview is a light screenshot, so in
            dark it sits on a soft frame and doesn't glare. */}
        <div data-reveal className="relative border border-hairline p-2 md:p-3 [[data-theme=dark]_&]:bg-surface-soft">
          <Crosshair className="crosshair-tl" />
          <Crosshair className="crosshair-tr" />
          <Crosshair className="crosshair-bl" />
          <Crosshair className="crosshair-br" />
          <img
            src="/sample-plan.webp" width={1280} height={800} loading="lazy" decoding="async" alt={COPY.sample.alt}
            className="h-auto w-full rounded-[14px] bg-surface"
          />
        </div>
      </div>
    </section>
  );
}
