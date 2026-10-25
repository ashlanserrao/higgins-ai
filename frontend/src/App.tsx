// Root: onboarding until there's a plan, then the dashboard. Printing shows every section.

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BudgetSection } from "@/features/budget/budget-section";
import { GuestsSection } from "@/features/guests/guests-section";
import { IdeasSection } from "@/features/ideas/ideas-section";
import { Questionnaire } from "@/features/onboarding/questionnaire";
import { OverviewSection } from "@/features/overview/overview-section";
import { Shell } from "@/features/shell/shell";
import { TasksSection } from "@/features/tasks/tasks-section";
import { VendorsSection } from "@/features/vendors/vendors-section";
import { SECTIONS, useNav, type Section } from "@/state/nav";
import { usePlanner } from "@/state/planner";

const VIEWS: Record<Section, () => React.JSX.Element> = {
  overview: OverviewSection, budget: BudgetSection, tasks: TasksSection,
  vendors: VendorsSection, guests: GuestsSection, ideas: IdeasSection,
};

function Onboarding() {
  return (
    <div className="min-h-screen px-4 py-10 md:py-16">
      <header className="mx-auto mb-8 max-w-3xl">
        <div className="mb-8 flex items-center gap-2.5">
          <span className="font-display grid size-10 place-items-center rounded-[10px] bg-primary-soft text-xl text-primary-ink" aria-hidden="true">H</span>
          <p className="font-display text-lg">Higgins AI</p>
        </div>
        <h1 className="text-3xl md:text-[2.75rem] md:leading-tight">Let's plan your celebration, calmly</h1>
        <p className="mt-3 max-w-2xl text-base text-muted-foreground md:text-lg">
          Weddings, birthdays and community events. In a few minutes you'll have a realistic budget, book-by dates and a
          timeline to share with family, and it keeps up as quotes come in and plans change.
        </p>
      </header>
      <main><Questionnaire /></main>
      <footer className="mx-auto mt-10 max-w-3xl text-xs text-muted-foreground">Your plan stays in this browser. Nothing goes to our server.</footer>
    </div>
  );
}

function Dashboard() {
  const { section } = useNav();
  const [editing, setEditing] = useState(false);
  const [printing, setPrinting] = useState(false);

  // Render every section, print, then go back to the one that was open.
  useEffect(() => {
    if (!printing) return;
    const done = () => setPrinting(false);
    window.addEventListener("afterprint", done, { once: true });
    const timer = window.setTimeout(() => window.print(), 50);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("afterprint", done);
    };
  }, [printing]);

  const View = VIEWS[section];
  return (
    <Shell onEdit={() => setEditing(true)} onPrint={() => setPrinting(true)}>
      {editing ? (
        <div className="space-y-4">
          <h1 tabIndex={-1} data-section-title className="text-2xl font-semibold tracking-tight">Edit event details</h1>
          <Questionnaire onDone={() => setEditing(false)} onCancel={() => setEditing(false)} />
        </div>
      ) : printing ? (
        SECTIONS.map((name) => {
          const Print = VIEWS[name];
          return <div key={name} className="break-before-page first:break-before-auto"><Print /></div>;
        })
      ) : (
        <View />
      )}
    </Shell>
  );
}

export default function App() {
  const { booting, bootError, options, plan, inputs, message } = usePlanner();

  // The event's own accent (wedding maroon, birthday berry, community indigo).
  useEffect(() => {
    document.documentElement.dataset.event = inputs?.event_type ?? "wedding";
  }, [inputs?.event_type]);
  return (
    <>
      <p role="status" aria-live="polite" className="sr-only">{message}</p>
      {booting ? (
        <div className="grid min-h-screen place-items-center text-muted-foreground" aria-busy="true">
          <p className="flex items-center gap-2"><Loader2 className="size-4 animate-spin" aria-hidden="true" /> Getting your plan ready…</p>
        </div>
      ) : !options ? (
        <div className="grid min-h-screen place-items-center p-4 text-center">
          <div className="space-y-3">
            <p role="alert" className="font-medium">{bootError}</p>
            <Button onClick={() => location.reload()}>Try again</Button>
          </div>
        </div>
      ) : plan ? (
        <Dashboard />
      ) : (
        <Onboarding />
      )}
    </>
  );
}
