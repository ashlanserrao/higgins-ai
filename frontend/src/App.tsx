// Root: onboarding until there's a plan, then the dashboard. Printing shows every section.
// The open event follows the URL, so back and forward move between events too.

import { lazy, Suspense, useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/app/toaster";
import { useNav } from "@/state/nav";
import { usePlanner } from "@/state/planner";

// Each page is its own chunk: a first visit to the landing page doesn't download the dashboard.
const Landing = lazy(() => import("@/features/landing/landing").then((m) => ({ default: m.Landing })));
const Onboarding = lazy(() => import("./pages/onboarding").then((m) => ({ default: m.Onboarding })));
const Dashboard = lazy(() => import("./pages/dashboard").then((m) => ({ default: m.Dashboard })));

/** While the plan boots or a page's chunk loads: one screen for both, so nothing jumps. Not a
 *  live region (the status line below speaks for the app), and it never takes focus. */
const Loading = () => (
  <div className="grid min-h-screen place-items-center text-muted-foreground" aria-busy="true">
    <p className="flex items-center gap-2"><Loader2 className="size-4 animate-spin" aria-hidden="true" /> Getting your plan ready…</p>
  </div>
);

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
        <Loading />
      ) : !options ? (
        <div className="grid min-h-screen place-items-center p-4 text-center">
          <div className="space-y-3">
            <p role="alert" className="font-medium">{bootError}</p>
            <Button onClick={() => location.reload()}>Try again</Button>
          </div>
        </div>
      ) : (
        <Suspense fallback={<Loading />}>
          {landing ? <Landing /> : plan ? <Dashboard /> : <Onboarding />}
        </Suspense>
      )}
      <Toaster />
    </>
  );
}
