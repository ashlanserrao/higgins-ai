// Landing page for first-time visitors (and #/welcome). The hero box is the way in: what's
// typed there goes to the new-event page, which reads it and fills the form.

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { CalendarCheck, ChevronDown, IndianRupee, Share2, Sparkles, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useNav } from "@/state/nav";
import { usePlanner } from "@/state/planner";
import { CONTACT_HREF, COPY, SIGN_IN_ROUTE } from "./copy";
import { Cell, CellGrid, CenterLine, Frame, SectionRule } from "./frame";

const VALUE_ICONS: LucideIcon[] = [IndianRupee, CalendarCheck, Share2];
/** Defines <higgins-how-it-works>. Loaded on this page only, once (imports are cached). */
const MACHINE_LOADER = "/hm/higgins-how-it-works.js";

/** Just the drawing: hides the component's corner captions, legend and frame, and drops its
 *  78vh height cap (index.css sizes it). Added to its shadow root, so it covers both the live
 *  machine and the phone poster. */
let machineTrim: CSSStyleSheet | null = null;
function trimMachine(host: HTMLElement | null) {
  const root = host?.shadowRoot;
  if (!root) return;
  if (!machineTrim) {
    machineTrim = new CSSStyleSheet();
    machineTrim.replaceSync(".hm-corner, .hm-legend { display: none } .hm-card { padding: 12px 0 0; box-shadow: none } .hm-stage svg { max-height: none }");
  }
  if (!root.adoptedStyleSheets.includes(machineTrim)) root.adoptedStyleSheets = [...root.adoptedStyleSheets, machineTrim];
}
const LINK = "rounded-md text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline";
/** 44px tall on phones, where the header doesn't stick and links are tapped. */
const TAP = "inline-flex min-h-11 items-center md:min-h-0";
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
    measure();
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

export function Landing() {
  const { events, activeId, returnTo, startNewEvent } = usePlanner();
  const { openPage, openEvent } = useNav();
  const [text, setText] = useState("");
  const [signIn, setSignIn] = useState(false);
  const lastEvent = activeId ?? returnTo ?? events.at(-1)?.id ?? null;
  const { scrolled, active } = useScrollState();

  const machine = useRef<HTMLElement>(null);
  useEffect(() => {
    import(/* @vite-ignore */ MACHINE_LOADER)
      .then(() => trimMachine(machine.current))
      .catch(() => {}); // without it the hero is just the copy
  }, []);

  const start = (event: FormEvent) => {
    event.preventDefault();
    if (events.length) startNewEvent();
    openPage("new", text.trim());
  };

  // Enter plans, Shift+Enter starts a new line.
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  };

  const openPrivacy = () => {
    const item = document.getElementById("faq-data") as HTMLDetailsElement | null;
    if (item) item.open = true;
    scrollToSection("faq-data");
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
    <div className="min-h-screen overflow-x-clip">
      <Frame>
      {/* Sticks from tablet up (80px tall, the sections' scroll margin), frosting once scrolled.
          On phones it scrolls away with the page and the links wrap onto their own row. */}
      <header className={cn("z-30 transition-colors md:sticky md:top-0", scrolled && "md:bg-canvas/85 md:backdrop-blur-md")}>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 px-4 py-4 md:grid md:h-20 md:grid-cols-[1fr_auto_1fr] md:px-10 md:py-0 lg:px-12">
          <a href="#/welcome" onClick={(e) => e.preventDefault()} className="flex items-center gap-2.5 justify-self-start rounded-lg" aria-label={COPY.nav.home}>
            <span className="font-display grid size-10 place-items-center rounded-[10px] bg-primary-soft text-xl text-primary-ink" aria-hidden="true">H</span>
            <span className="font-display text-lg">Higgins AI</span>
          </a>
          <nav aria-label="Page" className="order-last flex w-full flex-wrap justify-center gap-x-6 md:order-none md:w-auto">
            {sectionLink("how", COPY.nav.howItWorks)}
            {sectionLink("sample", COPY.nav.samplePlan)}
            {sectionLink("faq", COPY.nav.questions)}
          </nav>
          <Button
            variant="outline" size="sm" className="ml-auto h-11 rounded-full px-4 md:ml-0 md:h-9 md:justify-self-end"
            onClick={() => (SIGN_IN_ROUTE ? location.assign(SIGN_IN_ROUTE) : setSignIn(true))}
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
          <div className="mx-auto w-full max-w-[520px] px-4 text-center min-[720px]:max-w-none min-[720px]:text-left md:px-10 lg:px-12">
          <h1 id="hero-title" className="text-3xl md:text-[2.75rem] md:leading-tight">{COPY.hero.title}</h1>
          <p className="mt-4 text-base text-muted-foreground md:text-lg">{COPY.hero.body}</p>

          <form onSubmit={start} className="mt-8 rounded-[20px] bg-surface p-4 text-left shadow-raised md:p-5">
            <label htmlFor="hero-text" className="sr-only">{COPY.hero.label}</label>
            <Textarea
              id="hero-text" rows={3} maxLength={500} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKeyDown}
              placeholder={COPY.hero.placeholder} className="min-h-24 resize-none text-base"
            />
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Sparkles className="size-4 text-ai" aria-hidden="true" /> {COPY.hero.helper}
              </span>
              <Button type="submit" size="lg" className="w-full sm:w-auto">{COPY.hero.submit}</Button>
            </div>
          </form>

          <div className="mt-4 flex flex-wrap justify-center gap-2 min-[720px]:justify-start" role="group" aria-label={COPY.hero.examplesLabel}>
            {COPY.hero.examples.map((example) => (
              <Button key={example} type="button" variant="outline" size="sm" className="h-11 rounded-full sm:h-9"
                onClick={() => { setText(example); document.getElementById("hero-text")?.focus(); }}>
                {example}
              </Button>
            ))}
          </div>
          {lastEvent && (
            <p className="mt-4">
              <a href={`#/event/${lastEvent}/overview`} onClick={(e) => { e.preventDefault(); openEvent(lastEvent); }} className={cn(LINK, TAP)}>
                {COPY.nav.continuePlanning}
              </a>
            </p>
          )}
          </div>

          <div className="px-4 md:px-10 lg:px-12">
            <higgins-how-it-works ref={machine} src="/hm/machine-b.js" poster="/hm/poster-b.html" ratio="0.8600">
              <noscript><img src="/hm/poster-b-light.png" alt={COPY.hero.machineAlt} width={1244} height={876} className="h-auto w-full" /></noscript>
            </higgins-how-it-works>
          </div>
        </section>

        <SectionRule />
        <section id="how" tabIndex={-1} aria-labelledby="how-title" className="scroll-mt-6 outline-none md:scroll-mt-20">
          <h2 id="how-title" className="headline px-4 py-12 text-center text-3xl md:py-16 lg:text-[2.5rem]">{COPY.values.title}</h2>
          <CellGrid className="grid-cols-1 border-t border-hairline md:grid-cols-3">
            {COPY.values.items.map(({ title, body }, index) => {
              const Icon = VALUE_ICONS[index];
              return (
                <Cell key={title} className="p-6 md:p-8">
                  <Icon className="size-6 text-primary-text" aria-hidden="true" />
                  <h3 className="mt-4 text-lg">{title}</h3>
                  <p className="mt-1.5 text-muted-foreground">{body}</p>
                </Cell>
              );
            })}
          </CellGrid>
        </section>

        <SectionRule />
        <section id="sample" tabIndex={-1} aria-labelledby="sample-title" className="mx-auto max-w-5xl scroll-mt-6 px-4 py-16 outline-none md:scroll-mt-20 md:px-8 md:py-20">
          <h2 id="sample-title" className="sr-only">{COPY.sample.title}</h2>
          {/* The preview is a light screenshot; in dark it sits in a soft frame so it doesn't glare. */}
          <figure className="rounded-[24px] [[data-theme=dark]_&]:bg-surface-soft [[data-theme=dark]_&]:p-2">
            <img
              src="/sample-plan.webp" width={1280} height={800} loading="lazy" decoding="async" alt={COPY.sample.alt}
              className="h-auto w-full rounded-[20px] bg-surface shadow-raised"
            />
            <figcaption className="font-display mt-4 text-center text-lg text-muted-foreground">{COPY.sample.caption}</figcaption>
          </figure>
        </section>

        <SectionRule />
        {/* The heading on the left, the questions on the right as rows divided by hairlines. */}
        <section id="faq" tabIndex={-1} aria-labelledby="faq-title" className="relative grid scroll-mt-6 outline-none md:scroll-mt-20 md:grid-cols-2">
          <CenterLine />
          <h2 id="faq-title" className="headline px-4 py-12 text-3xl md:px-10 md:py-16 lg:px-12 lg:text-[2.5rem]">{COPY.faq.title}</h2>
          <div className="divide-y divide-hairline border-t border-hairline md:border-t-0">
            {COPY.faq.items.filter((item) => item.answer).map(({ id, question, answer }) => (
              <details key={id} id={id} tabIndex={-1} className="group scroll-mt-6 outline-none md:scroll-mt-20">
                <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 px-4 py-5 text-base font-medium md:px-10 lg:px-12 [&::-webkit-details-marker]:hidden">
                  {question}
                  <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
                </summary>
                <p className="lede px-4 pb-6 md:px-10 lg:px-12">{answer}</p>
              </details>
            ))}
          </div>
        </section>
        <SectionRule />
      </main>
      </Frame>

      <footer>
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 text-[13px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between md:px-8">
          <p>{COPY.footer.line}</p>
          <div className="flex gap-5">
            <a href="#faq-data" onClick={(e) => { e.preventDefault(); openPrivacy(); }} className={LINK}>{COPY.footer.privacy}</a>
            {CONTACT_HREF && <a href={CONTACT_HREF} className={LINK}>{COPY.footer.contact}</a>}
          </div>
        </div>
      </footer>

      <Dialog open={signIn} onOpenChange={setSignIn}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{COPY.signIn.title}</DialogTitle>
            <DialogDescription>{COPY.signIn.body}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSignIn(false)}>{COPY.signIn.close}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
