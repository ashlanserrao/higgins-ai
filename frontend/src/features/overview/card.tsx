// The Overview's card, overlapping the band: three tabs (the next step, what's coming up, ideas)
// over panels that size to their own content.

import { useState, type ReactNode } from "react";
import { ArrowRight, Flag, Sparkles } from "lucide-react";
import { Tabs as TabsPrimitive } from "radix-ui";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/common";
import { daysBetween, formatShortDate } from "@/lib/format";
import type { TimelineEntry } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useNav } from "@/state/nav";
import { usePlan } from "@/state/planner";
import { IdeasStatusLine } from "@/features/ideas/ideas-section";

export type OverviewTab = "next" | "soon" | "ideas";

const TABS: { id: OverviewTab; label: string; short: string }[] = [
  { id: "next", label: "Next step", short: "Next" },
  { id: "soon", label: "Coming up", short: "Soon" },
  { id: "ideas", label: "Ideas", short: "Ideas" },
];

// The last tab chosen, for this browser session only: every new visit opens on the next step.
const TAB_KEY = "overview:tab";
const readTab = (): OverviewTab => {
  try {
    const saved = sessionStorage.getItem(TAB_KEY);
    return TABS.some((tab) => tab.id === saved) ? (saved as OverviewTab) : "next";
  } catch {
    return "next";
  }
};
const saveTab = (tab: OverviewTab) => {
  try {
    sessionStorage.setItem(TAB_KEY, tab);
  } catch {
    // Storage blocked: the choice just isn't remembered.
  }
};

/** A label that keeps its active (bolder) width at all times, so the tabs never shift. */
function TabLabel({ children }: { children: string }) {
  return (
    <span className="grid">
      <span className="col-start-1 row-start-1">{children}</span>
      <span className="invisible col-start-1 row-start-1 font-medium" aria-hidden="true">{children}</span>
    </span>
  );
}

export function OverviewCard({ next, nextBadge, footer }: { next: ReactNode; nextBadge?: ReactNode; footer?: ReactNode }) {
  const [tab, setTab] = useState(readTab);
  const choose = (value: string) => {
    setTab(value as OverviewTab);
    saveTab(value as OverviewTab);
  };

  return (
    <section aria-label="Your plan" className="rounded-xl border bg-card p-4 shadow-card md:p-[18px] [[data-theme=dark]_&]:shadow-none">
      <TabsPrimitive.Root value={tab} onValueChange={choose}>
        <TabsPrimitive.List className="no-print flex gap-6 border-b">
          {TABS.map(({ id, label, short }) => (
            <TabsPrimitive.Trigger
              key={id} value={id}
              className={cn(
                "-mb-px flex min-h-11 items-center gap-1.5 rounded-sm border-b-2 border-transparent px-0.5 text-sm text-tertiary hover:text-foreground",
                "data-[state=active]:border-primary data-[state=active]:font-medium data-[state=active]:text-foreground",
              )}
            >
              <span className="min-[420px]:hidden"><TabLabel>{short}</TabLabel></span>
              <span className="max-[419px]:hidden"><TabLabel>{label}</TabLabel></span>
              {id === "next" && nextBadge}
            </TabsPrimitive.Trigger>
          ))}
        </TabsPrimitive.List>
        {/* Each panel is as tall as its own content, so the card shrinks to fit the tab. Inactive
            panels stay mounted but hidden, so a print shows all three, one after another. */}
        {TABS.map(({ id, label }) => (
          <TabsPrimitive.Content
            key={id} value={id} forceMount
            className={cn(
              "pt-4 outline-none data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:duration-150",
              "data-[state=inactive]:hidden print:data-[state=inactive]:!block",
            )}
          >
            <h2 className="sr-only print:not-sr-only print:mb-2 print:text-lg">{label}</h2>
            {id === "next" ? next : id === "soon" ? <ComingUp /> : <IdeasPanel />}
          </TabsPrimitive.Content>
        ))}
      </TabsPrimitive.Root>
      {footer}
    </section>
  );
}

/** A warning chip for an entry due within three days or overdue; nothing otherwise. */
function dueChip(entry: TimelineEntry, today: string) {
  const days = daysBetween(today, entry.date);
  if (entry.status === "overdue" || days < 0) return "Overdue";
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return days <= 3 ? `In ${days} days` : null;
}

const needsHeadsUp = (entry: TimelineEntry) => ["tight", "overdue", "at_risk"].includes(entry.status);

function ComingUp() {
  const { plan } = usePlan();
  const { go } = useNav();
  const open = plan.timeline.filter((entry) => entry.kind !== "event" && entry.status !== "done");
  const shown = open.slice(0, 3);
  const event = plan.timeline.find((entry) => entry.kind === "event");
  const restOnTrack = open.slice(3).every((entry) => !needsHeadsUp(entry) && !dueChip(entry, plan.today));

  return (
    <div className="flex flex-col gap-3">
      <ol className="space-y-2.5">
        {shown.map((entry) => {
          const chip = dueChip(entry, plan.today);
          return (
            <li key={`${entry.date}-${entry.label}`} className="flex items-center gap-3 text-sm">
              <time dateTime={entry.date} className="num w-12 shrink-0 text-xs text-tertiary">{formatShortDate(entry.date)}</time>
              <span className="min-w-0 flex-1">{entry.label}</span>
              {chip && <StatusBadge tone="warning">{chip}</StatusBadge>}
            </li>
          );
        })}
        {event && (
          <li className="flex items-center gap-3 text-sm text-primary-ink">
            <time dateTime={event.date} className="num w-12 shrink-0 text-xs">{formatShortDate(event.date)}</time>
            <span className="flex min-w-0 flex-1 items-center gap-1.5 font-medium">
              <Flag className="size-3.5 shrink-0" aria-hidden="true" /> {event.label}
            </span>
          </li>
        )}
      </ol>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        {restOnTrack ? <p className="text-success">Everything else is on track</p> : <span />}
        <Button size="sm" variant="link" className="no-print h-auto px-0 max-md:min-h-11 pointer-coarse:min-h-11" onClick={() => go("tasks")}>
          Full timeline <ArrowRight aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

/** The first sentence, whole: a hint is never cut mid-phrase. */
const firstSentence = (text: string) => text.match(/^.*?[.!?](?=\s|$)/s)?.[0] ?? text;

function IdeasPanel() {
  const { ideas, ideasStatus, loadIdeas } = usePlan();
  const { go } = useNav();

  if (ideasStatus === "unavailable")
    return <p className="text-sm text-muted-foreground">Ideas need the AI, which isn't set up here. Everything else works without it.</p>;
  if (!ideas && ideasStatus === "loading")
    return (
      <div className="space-y-3" aria-live="polite">
        <p className="sr-only">Finding ideas for you, usually under 10 seconds.</p>
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-4/5" />
          </div>
        ))}
      </div>
    );
  if (!ideas)
    return (
      <div className="space-y-3">
        <IdeasStatusLine />
        <p className="text-sm text-muted-foreground">Themes, décor and food ideas that fit your event and budget.</p>
        <Button variant="ai" onClick={loadIdeas}><Sparkles aria-hidden="true" /> Get ideas</Button>
      </div>
    );

  const picks = [ideas.themes[0], ideas.decor[0], ideas.food[0]].filter(Boolean);
  return (
    <div className="flex flex-col gap-3">
      <IdeasStatusLine />
      <ul className="space-y-2.5">
        {picks.map((idea, index) => (
          <li key={idea.title}>
            <p className="flex items-center gap-2 text-sm">
              {idea.title}
              {index === 0 && <span className="rounded-full bg-surface-soft px-1.5 text-xs font-medium text-muted-foreground">AI</span>}
            </p>
            <p className="text-xs text-tertiary">{firstSentence(idea.detail)}</p>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <p className="text-tertiary">Suggested by AI. Give it a quick check.</p>
        <Button size="sm" variant="link" className="no-print h-auto px-0 max-md:min-h-11 pointer-coarse:min-h-11" onClick={() => go("ideas")}>
          All ideas <ArrowRight aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
