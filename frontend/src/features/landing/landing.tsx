// Landing page for first-time visitors (and #/welcome). The hero box is the way in: what's
// typed there goes to the new-event page, which reads it and fills the form. No sign-up.

import { useState, type FormEvent, type KeyboardEvent } from "react";
import { CalendarCheck, ChevronDown, IndianRupee, Lock, Share2, Sparkles, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useNav } from "@/state/nav";
import { usePlanner } from "@/state/planner";
import { CONTACT_HREF, COPY, SIGN_IN_ROUTE } from "./copy";

const VALUE_ICONS: LucideIcon[] = [IndianRupee, CalendarCheck, Share2];
const LINK = "rounded-md text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline";

/** Smooth unless the visitor prefers less motion; focus follows for keyboard users. */
function scrollToSection(id: string) {
  const target = document.getElementById(id);
  if (!target) return;
  const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  target.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
  target.focus({ preventScroll: true });
}

export function Landing() {
  const { events, activeId, returnTo, startNewEvent } = usePlanner();
  const { openPage, openEvent } = useNav();
  const [text, setText] = useState("");
  const [signIn, setSignIn] = useState(false);
  const lastEvent = activeId ?? returnTo ?? events.at(-1)?.id ?? null;

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
    <a href={`#${id}`} onClick={(e) => { e.preventDefault(); scrollToSection(id); }} className={LINK}>{label}</a>
  );

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-5 md:px-8">
        <a href="#/welcome" onClick={(e) => e.preventDefault()} className="flex items-center gap-2.5 rounded-lg" aria-label={COPY.nav.home}>
          <span className="font-display grid size-10 place-items-center rounded-[10px] bg-primary-soft text-xl text-primary-ink" aria-hidden="true">H</span>
          <span className="font-display text-lg">Higgins AI</span>
        </a>
        <nav aria-label="Page" className="ml-auto flex flex-wrap items-center gap-x-5 gap-y-2">
          {sectionLink("how", COPY.nav.howItWorks)}
          {sectionLink("sample", COPY.nav.samplePlan)}
          {lastEvent && (
            <a href={`#/event/${lastEvent}/overview`} onClick={(e) => { e.preventDefault(); openEvent(lastEvent); }} className={LINK}>
              {COPY.nav.continuePlanning}
            </a>
          )}
          <Button variant="outline" size="sm" onClick={() => (SIGN_IN_ROUTE ? location.assign(SIGN_IN_ROUTE) : setSignIn(true))}>
            {COPY.nav.signIn}
          </Button>
        </nav>
      </header>

      <main>
        <section aria-labelledby="hero-title" className="mx-auto max-w-[520px] px-4 pt-10 pb-16 text-center md:pt-16 md:pb-20">
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

          <div className="mt-4 flex flex-wrap justify-center gap-2" role="group" aria-label={COPY.hero.examplesLabel}>
            {COPY.hero.examples.map((example) => (
              <Button key={example} type="button" variant="outline" size="sm" className="h-11 rounded-full sm:h-9"
                onClick={() => { setText(example); document.getElementById("hero-text")?.focus(); }}>
                {example}
              </Button>
            ))}
          </div>
          <p className="mt-5 flex items-center justify-center gap-1.5 text-[13px] text-muted-foreground">
            <Lock className="size-3.5" aria-hidden="true" /> {COPY.hero.trust}
          </p>
        </section>

        <section id="how" tabIndex={-1} aria-labelledby="how-title" className="mx-auto max-w-6xl scroll-mt-6 px-4 pb-16 outline-none md:px-8 md:pb-20">
          <h2 id="how-title" className="mb-6 text-center text-2xl">{COPY.values.title}</h2>
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {COPY.values.items.map(({ title, body }, index) => {
              const Icon = VALUE_ICONS[index];
              return (
                <li key={title} className="rounded-[16px] bg-surface p-6 shadow-card">
                  <Icon className="size-6 text-primary" aria-hidden="true" />
                  <h3 className="mt-4 text-lg">{title}</h3>
                  <p className="mt-1.5 text-muted-foreground">{body}</p>
                </li>
              );
            })}
          </ul>
        </section>

        <section id="sample" tabIndex={-1} aria-labelledby="sample-title" className="mx-auto max-w-5xl scroll-mt-6 px-4 pb-16 outline-none md:px-8 md:pb-20">
          <h2 id="sample-title" className="sr-only">{COPY.sample.title}</h2>
          <figure>
            <img
              src="/sample-plan.webp" width={1280} height={800} loading="lazy" decoding="async" alt={COPY.sample.alt}
              className="h-auto w-full rounded-[20px] bg-surface shadow-raised"
            />
            <figcaption className="font-display mt-4 text-center text-lg text-muted-foreground">{COPY.sample.caption}</figcaption>
          </figure>
        </section>

        <section aria-labelledby="faq-title" className="mx-auto max-w-3xl px-4 pb-20 md:px-8">
          <h2 id="faq-title" className="mb-6 text-center text-2xl">{COPY.faq.title}</h2>
          <div className="space-y-3">
            {COPY.faq.items.filter((item) => item.answer).map(({ id, question, answer }) => (
              <details key={id} id={id} tabIndex={-1} className="group scroll-mt-6 rounded-xl bg-surface shadow-card outline-none">
                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-5 py-3 font-medium [&::-webkit-details-marker]:hidden">
                  {question}
                  <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
                </summary>
                <p className="px-5 pb-4 text-muted-foreground">{answer}</p>
              </details>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t">
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
