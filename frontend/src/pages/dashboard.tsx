// The signed-in app: the shell and every section, in one chunk so printing (which renders all of
// them at once) never waits on a lazy section. Lazy-loaded by App.

import { useEffect, useState } from "react";
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

export function Dashboard() {
  const { section } = useNav();
  const { activeId } = usePlanner();
  // Editing belongs to one event: switching away closes it.
  const [editingFor, setEditingFor] = useState<string | null | undefined>(undefined);
  const editing = editingFor === activeId;
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
    <Shell onEdit={() => setEditingFor(activeId)} onPrint={() => setPrinting(true)}>
      {editing ? (
        <div className="space-y-4">
          <h1 tabIndex={-1} data-section-title className="text-2xl font-semibold tracking-tight">Edit event details</h1>
          <Questionnaire onDone={() => setEditingFor(undefined)} onCancel={() => setEditingFor(undefined)} />
        </div>
      ) : printing ? (
        SECTIONS.map((name) => {
          const Print = VIEWS[name];
          return <div key={name} className="break-before-page first:break-before-auto"><Print /></div>;
        })
      ) : (
        // Each event gets fresh section state: nothing half-typed carries over.
        <View key={activeId} />
      )}
    </Shell>
  );
}
