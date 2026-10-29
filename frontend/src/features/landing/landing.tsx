// Landing page for first-time visitors (and #/welcome). The hero box (PlanInput) is the way in.

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useNav } from "@/state/nav";
import { usePlanner } from "@/state/planner";
import { CONTACT_HREF, COPY } from "./copy";
import { Cell, CellGrid, CenterLine, Frame, SectionRule } from "./frame";
import { PlanInput } from "./plan-input";
import { useReveal } from "./reveal";
import { HowItWorks, PAD, PlanForStrip, SamplePlan, WhatYouGet } from "./sections";

/** Defines <higgins-how-it-works>. Loaded on this page only, once (imports are cached). */
const MACHINE_LOADER = "/hm/loader.js";

/** Just the drawing: hides the component's corner captions, legend and frame, and drops its
 *  78vh height cap (index.css sizes it). The top gap, room for a hover label, scales with the
 *  width so the card keeps the exact shape index.css reserves for it. Added to its shadow root, so it covers both the live
 *  machine and the phone poster. */
let machineTrim: CSSStyleSheet | null = null;
function trimMachine(host: HTMLElement | null) {
  const root = host?.shadowRoot;
  if (!root) return;
  if (!machineTrim) {
    machineTrim = new CSSStyleSheet();
    machineTrim.replaceSync(".hm-corner, .hm-legend { display: none } .hm-card { padding: 2% 0 0; box-shadow: none } .hm-stage svg { max-height: none }");
  }
  if (!root.adoptedStyleSheets.includes(machineTrim)) root.adoptedStyleSheets = [...root.adoptedStyleSheets, machineTrim];
}
const LINK = "rounded-md text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline";
/** 44px tall wherever links are tapped: phones, and touch screens at any width. */
const TAP = "inline-flex min-h-11 items-center md:min-h-0 md:pointer-coarse:min-h-11";
/** The sections the header links to, in page order. */
const NAV_SECTIONS = ["how", "sample", "faq"];

/** Smooth unless the visitor prefers less motion; focus follows for keyboard users. */
function scrollToSection(id: string) {
  const target = document.getElementById(id);
  if (!target) return;
  const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  target.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
  target.focus({ preventScroll: true });
}

/** Whether the page has scrolled past 8px (the sticky header then frosts its background), and
 *  which section the header marks: the last one whose top has passed 40% of the viewport, or
 *  the last of all once the page is scrolled to the bottom. */
function useScrollState() {
  const [state, setState] = useState<{ scrolled: boolean; active: string | null }>({ scrolled: false, active: null });
  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      const top = (id: string) => document.getElementById(id)?.getBoundingClientRect().top ?? Infinity;
      const atBottom = scrollY > 0 && innerHeight + scrollY >= document.documentElement.scrollHeight - 2;
      const active = atBottom ? NAV_SECTIONS.at(-1)! : NAV_SECTIONS.filter((id) => top(id) <= innerHeight * 0.4).at(-1) ?? null;
      const scrolled = scrollY > 8;
      setState((s) => (s.scrolled === scrolled && s.active === active ? s : { scrolled, active }));
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    // The first reading waits for the first paint: measured straight after React's commit, it
    // would force a layout of the whole page before anything shows.
    frame = requestAnimationFrame(() => (frame = requestAnimationFrame(measure)));
    addEventListener("scroll", schedule, { passive: true });
    addEventListener("resize", schedule);
    return () => {
      removeEventListener("scroll", schedule);
      removeEventListener("resize", schedule);
      cancelAnimationFrame(frame);
    };
  }, []);
  return state;
}

/** The H tile and the name, as in the app's sidebar. */
function Brand({ small = false }: { small?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className={cn("font-display grid place-items-center rounded-[10px] bg-primary-soft text-primary-ink", small ? "size-8 text-base" : "size-10 text-xl")} aria-hidden="true">H</span>
      <span className={cn("font-display text-foreground", small ? "text-base" : "text-lg")}>Higgins AI</span>
    </span>
  );
}

export function Landing() {
  const { events, activeId, returnTo, startNewEvent } = usePlanner();
  const { openPage, openEvent } = useNav();
  const [text, setText] = useState("");
  const lastEvent = activeId ?? returnTo ?? events.at(-1)?.id ?? null;
  const { scrolled, active } = useScrollState();

  const page = useRef<HTMLDivElement>(null);
  useReveal(page);

  const machine = useRef<HTMLElement>(null);
  useEffect(() => {
    import(/* @vite-ignore */ MACHINE_LOADER)
      .then(() => trimMachine(machine.current))
      .catch(() => {}); // without it the hero is just the copy
  }, []);

  const start = () => {
    if (events.length) startNewEvent();
    openPage("new", text.trim());
  };

  // The footer's Privacy link opens the data question and moves focus to it.
  const openPrivacy = () => {
    const item = document.getElementById("faq-data") as HTMLDetailsElement | null;
    if (!item) return;
    item.open = true;
    scrollToSection("faq-data");
    item.querySelector("summary")?.focus({ preventScroll: true });
  };

  const sectionLink = (id: string, label: string) => (
    <a
      href={`#${id}`} aria-current={active === id ? "true" : undefined} onClick={(e) => { e.preventDefault(); scrollToSection(id); }}
      className={cn(LINK, TAP, active === id && "text-primary-ink")}
    >
      {label}
    </a>
  );

  return (
    <div ref={page} className="min-h-screen overflow-x-clip">
      <Frame>
      {/* Sticks from tablet up (80px tall, the sections' scroll margin), frosting once scrolled.
          On phones it scrolls away with the page and the links wrap onto their own row. */}
      <header data-scrolled={scrolled || undefined} className="landing-header z-30 md:sticky md:top-0">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 px-4 py-4 md:grid md:h-20 md:grid-cols-[1fr_auto_1fr] md:px-6 md:py-0 lg:px-12">
          <a href="#/welcome" onClick={(e) => e.preventDefault()} className={cn("justify-self-start rounded-lg", TAP)}>
            <Brand />
          </a>
          <nav aria-label="Page" className="order-last flex w-full flex-wrap justify-center gap-x-6 md:order-none md:w-auto">
            {sectionLink("how", COPY.nav.howItWorks)}
            {sectionLink("sample", COPY.nav.samplePlan)}
            {sectionLink("faq", COPY.nav.questions)}
          </nav>
          <Button
            variant="outline" size="sm" className="ml-auto h-11 rounded-full px-4 md:ml-0 md:h-9 md:justify-self-end md:pointer-coarse:h-11"
            onClick={() => openPage("signin")}
          >
            {COPY.nav.signIn}
          </Button>
        </div>
        <SectionRule solid />
      </header>

      <main>
        {/* Two halves split by a centre line from 720px (where the machine switches from poster
            to live), stacked below. */}
        <section aria-labelledby="hero-title" className="relative grid items-center gap-y-10 pt-10 pb-16 md:pt-16 md:pb-20 min-[720px]:grid-cols-2">
          <CenterLine />
          <div className={cn("mx-auto w-full max-w-[520px] text-center min-[720px]:max-w-none min-[720px]:text-left", PAD)}>
          <h1 id="hero-title" className="headline text-5xl leading-[1.04] md:text-6xl xl:text-6xl">
            {COPY.hero.title.map((line) => <span key={line} className="block">{line}</span>)}
          </h1>
          <p className="lede mt-5 md:text-lg">{COPY.hero.body}</p>

          <div className="mt-8">
            <PlanInput id="hero-text" value={text} onChange={setText} onSubmit={start} />
          </div>

          <div className="mt-4 flex flex-wrap justify-center gap-2 min-[720px]:justify-start" role="group" aria-label={COPY.hero.examplesLabel}>
            {COPY.hero.examples.map((example) => (
              <Button key={example} type="button" variant="outline" size="sm" className="h-11 rounded-full md:h-9 md:pointer-coarse:h-11"
                onClick={() => { setText(example); document.getElementById("hero-text")?.focus(); }}>
                {example}
              </Button>
            ))}
          </div>
          <p className="mt-4 flex flex-wrap justify-center gap-x-6 min-[720px]:justify-start">
            <a href="#sample" onClick={(e) => { e.preventDefault(); scrollToSection("sample"); }} className={cn(LINK, TAP, "text-foreground underline")}>
              {COPY.hero.seeSample}
            </a>
            {lastEvent && (
              <a href={`#/event/${lastEvent}/overview`} onClick={(e) => { e.preventDefault(); openEvent(lastEvent); }} className={cn(LINK, TAP)}>
                {COPY.nav.continuePlanning}
              </a>
            )}
          </p>
          </div>

          <div className={PAD}>
            <higgins-how-it-works ref={machine} src="/hm/machine.js" poster="/hm/poster.html" ratio="0.8600">
              <noscript><img src="/hm/poster-light.png" alt={COPY.hero.machineAlt} width={1244} height={876} className="h-auto w-full" /></noscript>
            </higgins-how-it-works>
          </div>
        </section>

        <SectionRule />
        <PlanForStrip />
        <SectionRule />
        <WhatYouGet />
        <SectionRule />
        <HowItWorks />
        <SectionRule />
        <SamplePlan />

        <SectionRule />
        {/* The heading on the left, the questions on the right as rows divided by hairlines. */}
        <section id="faq" tabIndex={-1} aria-labelledby="faq-title" className="relative grid scroll-mt-6 outline-none focus-visible:shadow-none md:scroll-mt-20 md:grid-cols-2">
          <CenterLine />
          <h2 id="faq-title" data-reveal className={cn("headline py-14 text-3xl leading-[1.08] md:text-4xl lg:py-24 lg:text-[2.75rem]", PAD)}>{COPY.faq.title}</h2>
          <div className="divide-y divide-hairline border-t border-hairline md:border-t-0">
            {COPY.faq.items.filter((item) => item.answer).map(({ id, question, answer }) => (
              <details key={id} id={id} data-reveal className="group scroll-mt-6 md:scroll-mt-20">
                <summary className={cn("flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 py-5 text-base font-medium [&::-webkit-details-marker]:hidden", PAD)}>
                  {question}
                  <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
                </summary>
                <p className={cn("lede pb-6", PAD)}>{answer}</p>
              </details>
            ))}
          </div>
        </section>

        <SectionRule />
        {/* The same box as the hero, sharing its text. */}
        <section aria-labelledby="closing-title" className="relative grid items-center md:grid-cols-2">
          <CenterLine />
          <div data-reveal className={cn("pt-14 pb-8 md:py-14 lg:py-24", PAD)}>
            <p className="eyebrow">{COPY.closing.eyebrow}</p>
            <h2 id="closing-title" className="headline mt-3 text-3xl leading-[1.08] md:text-4xl lg:text-[2.75rem]">{COPY.closing.title}</h2>
          </div>
          <div data-reveal className={cn("pb-14 md:py-14 lg:py-24", PAD)}>
            <PlanInput id="closing-text" value={text} onChange={setText} onSubmit={start} />
          </div>
        </section>
        <SectionRule />
      </main>

      <footer>
        <CellGrid as="div" className="grid-cols-1 text-[13px] text-muted-foreground md:grid-cols-3">
          <Cell as="div" className={cn("flex items-center py-6", PAD)}>
            <Brand small />
          </Cell>
          <Cell as="div" className={cn("flex items-center gap-6 py-6", PAD)}>
            <a href="#faq-data" onClick={(e) => { e.preventDefault(); openPrivacy(); }} className={cn(LINK, TAP, "text-[13px]")}>{COPY.footer.privacy}</a>
            {CONTACT_HREF && <a href={CONTACT_HREF} className={cn(LINK, TAP, "text-[13px]")}>{COPY.footer.contact}</a>}
          </Cell>
          <Cell as="div" className={cn("flex items-center py-6", PAD)}>
            <p>{COPY.footer.line}</p>
          </Cell>
        </CellGrid>
      </footer>
      </Frame>

    </div>
  );
}
