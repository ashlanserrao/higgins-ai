// AI ideas for themes, décor, food and entertainment. Always labelled as AI, and marked
// stale when the plan changes after they were made.

import { Lightbulb, Loader2, Palette, PartyPopper, RefreshCw, Sparkles, Utensils, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AiBadge, AiNote, EmptyState, Panel } from "@/components/common";
import { PageBand } from "@/features/shell/page-band";
import type { EventIdeas } from "@/lib/types";
import { usePlan } from "@/state/planner";

const CATEGORIES: { key: keyof Omit<EventIdeas, "triage_advice">; label: string; icon: LucideIcon }[] = [
  { key: "themes", label: "Themes", icon: Sparkles },
  { key: "decor", label: "Décor", icon: Palette },
  { key: "food", label: "Food & menu", icon: Utensils },
  { key: "entertainment", label: "Entertainment", icon: PartyPopper },
];

export function IdeasStatusLine() {
  const { ideasStatus, loadIdeas } = usePlan();
  if (ideasStatus === "stale")
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-lg bg-ai-tint/60 px-4 py-2.5 text-sm">
        <span className="flex-1">These ideas were made before your latest changes.</span>
        <Button size="sm" variant="ai" onClick={loadIdeas}><RefreshCw aria-hidden="true" /> Refresh ideas</Button>
      </div>
    );
  if (ideasStatus === "failed")
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-lg bg-danger-soft px-4 py-2.5 text-sm">
        <span className="flex-1">The ideas didn't come through this time. Your plan is fine.</span>
        <Button size="sm" variant="outline" onClick={loadIdeas}><RefreshCw aria-hidden="true" /> Try again</Button>
      </div>
    );
  return null;
}

export function IdeasSection() {
  const { ideas, ideasStatus, loadIdeas, inputs } = usePlan();
  const loading = ideasStatus === "loading";

  return (
    <div className="space-y-6">
      <PageBand
        eyebrow="Inspiration"
        title="Ideas"
        description="Ideas that fit your event, city, budget and must-haves. No vendor names or prices, just inspiration."
        actions={
          ideas && ideasStatus !== "unavailable" && (
            <Button variant="outline" onClick={loadIdeas} disabled={loading}><RefreshCw aria-hidden="true" /> New ideas</Button>
          )
        }
      >
        {(inputs.must_haves || inputs.preferences) && (
          <p className="mt-2 max-w-3xl text-[13px] text-primary-foreground/85">
            {inputs.must_haves && <>Must-haves: <span className="text-primary-foreground">{inputs.must_haves}</span>. </>}
            {inputs.preferences && <>Your taste: <span className="text-primary-foreground">{inputs.preferences}</span></>}
          </p>
        )}
      </PageBand>
      {/* One card over the band's foot, whatever state the ideas are in. */}
      <section aria-label="Your ideas" className="space-y-4 rounded-xl border bg-card p-4 shadow-card md:p-[18px] [[data-theme=dark]_&]:shadow-none">
        <IdeasStatusLine />
        <div aria-live="polite" aria-busy={loading} className="space-y-4">
          {ideasStatus === "unavailable" && (
            <EmptyState icon={Lightbulb} title="Ideas need the AI">It isn't set up here, but everything else in your plan works without it.</EmptyState>
          )}
          {ideasStatus === "idle" && !ideas && (
            <EmptyState icon={Lightbulb} title="No ideas yet">
              <Button className="mt-2" onClick={loadIdeas}><Sparkles aria-hidden="true" /> Get ideas for your event</Button>
            </EmptyState>
          )}
          {loading && (
            <p className="flex items-center gap-2 text-sm text-ai"><Loader2 className="size-4 animate-spin" aria-hidden="true" /> Finding ideas for you… usually under 10 seconds.</p>
          )}
          {(loading || ideas) && <div className="grid gap-4 md:grid-cols-2">
            {CATEGORIES.map(({ key, label, icon }) => (
              <Panel key={key} title={label} icon={icon} tone="ai" actions={<AiBadge />}>
                {loading && !ideas ? (
                  <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full bg-ai-tint" />)}</div>
                ) : ideas ? (
                  <ul className="space-y-3">
                    {ideas[key].map((idea) => (
                      <li key={idea.title} className="rounded-lg bg-card p-4 shadow-card">
                        <p className="font-display text-base">{idea.title}</p>
                        <p className="mt-0.5 text-sm text-muted-foreground">{idea.detail}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">—</p>
                )}
              </Panel>
            ))}
          </div>}
          {ideas && <AiNote />}
        </div>
      </section>
    </div>
  );
}
