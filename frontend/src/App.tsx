// Root: onboarding until there's a plan, then the dashboard. Printing shows every section.
// The open event follows the URL, so back and forward move between events too.

import { useEffect, useRef, useState } from "react";
import { CalendarCheck, Loader2, PieChart, Share2, Undo2, X, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BudgetSection } from "@/features/budget/budget-section";
import { GuestsSection } from "@/features/guests/guests-section";
import { IdeasSection } from "@/features/ideas/ideas-section";
import { Questionnaire } from "@/features/onboarding/questionnaire";
import { Landing } from "@/features/landing/landing";
import { OverviewSection } from "@/features/overview/overview-section";
import { Shell } from "@/features/shell/shell";
import { TasksSection } from "@/features/tasks/tasks-section";
import { VendorsSection } from "@/features/vendors/vendors-section";
import { SECTIONS, useNav, type Section } from "@/state/nav";
import { eventName } from "@/lib/format";
import { usePlanner } from "@/state/planner";

const VIEWS: Record<Section, () => React.JSX.Element> = {
  overview: OverviewSection, budget: BudgetSection, tasks: TasksSection,
  vendors: VendorsSection, guests: GuestsSection, ideas: IdeasSection,
};

/** Keeps the open event and the URL in step, whichever of them changed. */
function useEventRoute() {
  const { eventId, page, openEvent } = useNav();
  const { booting, activeId, events, switchEvent } = usePlanner();
  const synced = useRef({ eventId, activeId: null as string | null });

  useEffect(() => {
    if (booting || page === "welcome") return;
    const known = (id: string | null) => events.some((e) => e.id === id);
    if (eventId !== synced.current.eventId && eventId && eventId !== activeId && known(eventId)) {
      // Back, forward or a link: open that event.
      synced.current = { eventId, activeId: eventId };
      switchEvent(eventId);
    } else if (activeId && activeId !== eventId) {
      // Switched here: the URL follows. A missing or unknown event in the URL is replaced, not stacked.
      synced.current = { eventId: activeId, activeId };
      openEvent(activeId, !known(eventId));
    } else {
      synced.current = { eventId, activeId };
    }
  }, [booting, eventId, page, activeId, events, openEvent, switchEvent]);
}

/** After a delete: what went, and a way to bring it back. */
function DeletedNotice() {
  const { lastDeleted, undoDelete, dismissDeleted } = usePlanner();
  if (!lastDeleted) return null;
  return (
    <div className="no-print fixed inset-x-4 bottom-20 z-40 mx-auto flex max-w-md items-center gap-3 rounded-xl bg-card px-4 py-3 text-sm shadow-raised lg:bottom-6">
      <span className="min-w-0 flex-1 truncate">Deleted <span className="font-medium">{eventName(lastDeleted.event)}</span></span>
      <Button size="sm" variant="outline" onClick={undoDelete}><Undo2 aria-hidden="true" /> Undo</Button>
      <Button size="icon-sm" variant="ghost" onClick={dismissDeleted} aria-label="Dismiss"><X aria-hidden="true" /></Button>
    </div>
  );
}

const YOU_GET: { icon: LucideIcon; label: string }[] = [
  { icon: PieChart, label: "A budget split" },
  { icon: CalendarCheck, label: "Book-by dates" },
  { icon: Share2, label: "A plan to share" },
];

function Onboarding() {
  const { returnTo, events, cancelNewEvent } = usePlanner();
  const { draft, clearDraft, openPage } = useNav();
  const [initialText] = useState(draft);
  const canGoBack = events.some((e) => e.id === returnTo);
  useEffect(clearDraft, [clearDraft]);
  return (
    <div className="min-h-screen px-4 py-10 md:py-16">
      <header className="mx-auto mb-8 max-w-3xl">
        <a
          href="#/welcome"
          onClick={(e) => {
            e.preventDefault();
            openPage("welcome");
          }}
          className="mb-8 inline-flex items-center gap-2.5 rounded-lg"
        >
          <span className="font-display grid size-10 place-items-center rounded-[10px] bg-primary-soft text-xl text-primary-ink" aria-hidden="true">H</span>
          <span className="font-display text-lg">Higgins AI</span>
        </a>
        <h1 className="text-3xl md:text-[2.75rem] md:leading-tight">Let's plan your celebration, calmly</h1>
        <p className="mt-3 max-w-2xl text-base text-muted-foreground md:text-lg">
          Weddings, birthdays and community events. In about a minute you'll have a realistic budget, book-by dates and a
          timeline to share with family, and it keeps up as quotes come in and plans change.
        </p>
        <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground" aria-label="What you'll get">
          {YOU_GET.map(({ icon: Icon, label }) => (
            <li key={label} className="flex items-center gap-1.5"><Icon className="size-4 text-primary" aria-hidden="true" /> {label}</li>
          ))}
        </ul>
      </header>
      <main><Questionnaire initialText={initialText} onCancel={canGoBack ? cancelNewEvent : undefined} /></main>
    </div>
  );
}

function Dashboard() {
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

export default function App() {
  const { booting, bootError, options, plan, inputs, events, shared, message } = usePlanner();
  const { page } = useNav();
  useEventRoute();
  // First-time visitors start on the landing page; anyone with a saved event goes to it.
  const landing = page === "welcome" || (!plan && !shared && !events.length && page !== "new");

  // The event's own accent (wedding maroon, birthday berry, community indigo); wedding on the landing page.
  useEffect(() => {
    document.documentElement.dataset.event = landing ? "wedding" : inputs?.event_type ?? "wedding";
  }, [landing, inputs?.event_type]);
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
      ) : landing ? (
        <Landing />
      ) : plan ? (
        <Dashboard />
      ) : (
        <Onboarding />
      )}
      <DeletedNotice />
    </>
  );
}
