// The signed-in app: the shell and every section, in one chunk, and the one-page print sheet.
// Lazy-loaded by App.

import { useState } from "react";
import { BudgetSection } from "@/features/budget/budget-section";
import { GuestsSection } from "@/features/guests/guests-section";
import { IdeasSection } from "@/features/ideas/ideas-section";
import { Questionnaire } from "@/features/onboarding/questionnaire";
import { OverviewSection } from "@/features/overview/overview-section";
import { PrintSheet } from "@/features/print/print-sheet";
import { Shell } from "@/features/shell/shell";
import { TasksSection } from "@/features/tasks/tasks-section";
import { VendorsSection } from "@/features/vendors/vendors-section";
import { useNav, type Section } from "@/state/nav";
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

  const View = VIEWS[section];
  return (
    <Shell onEdit={() => setEditingFor(activeId)} onPrint={() => window.print()}>
      {editing ? (
        <div className="space-y-4">
          <h1 tabIndex={-1} data-section-title className="text-2xl font-semibold tracking-tight">Edit event details</h1>
          <Questionnaire onDone={() => setEditingFor(undefined)} onCancel={() => setEditingFor(undefined)} />
        </div>
      ) : (
        // Each event gets fresh section state: nothing half-typed carries over.
        <View key={activeId} />
      )}
      {/* Printing shows only this, whichever section is open, and Ctrl+P too. */}
      <PrintSheet />
    </Shell>
  );
}
