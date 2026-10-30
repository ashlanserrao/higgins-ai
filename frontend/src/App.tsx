// Root: the landing page and sign-in for visitors; for a signed-in account, onboarding until
// there's a plan, then the dashboard. Printing shows every section. The open event follows the
// URL, so back and forward move between events too.

import { lazy, Suspense, useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/app/toaster";
import { useAuth } from "@/state/auth";
import { useNav } from "@/state/nav";
import { usePlanner } from "@/state/planner";

// Each page is its own chunk: a first visit to the landing page doesn't download the dashboard.
const Landing = lazy(() => import("@/features/landing/landing").then((m) => ({ default: m.Landing })));
const Onboarding = lazy(() => import("./pages/onboarding").then((m) => ({ default: m.Onboarding })));
const Dashboard = lazy(() => import("./pages/dashboard").then((m) => ({ default: m.Dashboard })));
const SignIn = lazy(() => import("@/features/auth/sign-in").then((m) => ({ default: m.SignIn })));

/** While the plan boots or a page's chunk loads: one screen for both, so nothing jumps. Not a
 *  live region (the status line below speaks for the app), and it never takes focus. */
const Loading = () => (
  <div className="grid min-h-screen place-items-center text-muted-foreground" aria-busy="true">
    <p className="flex items-center gap-2"><Loader2 className="size-4 animate-spin" aria-hidden="true" /> Getting your plan ready…</p>
  </div>
);

/** Keeps the open event and the URL in step, whichever of them changed. */
function useEventRoute(outside: boolean) {
  const { eventId, page, openEvent } = useNav();
  const { booting, activeId, events, switchEvent } = usePlanner();
  const synced = useRef({ eventId, activeId: null as string | null });

  // biome-ignore lint/correctness/useExhaustiveDependencies: page is a deliberate trigger: moving between pages re-syncs the URL with the open event.
  useEffect(() => {
    if (booting || outside) return;
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
  }, [booting, outside, eventId, page, activeId, events, openEvent, switchEvent]);
}

/** Arriving at #/new from the landing page by way of signing in, the account's last event
 *  opens first: once it has, start the new one the visitor asked for. Once per account. */
function useNewEventAfterSignIn() {
  const { page } = useNav();
  const { booting, plan, shared, startNewEvent } = usePlanner();
  const checked = useRef(false);
  useEffect(() => {
    if (booting || checked.current) return;
    checked.current = true;
    if (page === "new" && plan && !shared) startNewEvent();
  }, [booting, page, plan, shared, startNewEvent]);
}

export default function App() {
  const { booting, bootError, options, plan, inputs, shared, message } = usePlanner();
  const { user } = useAuth();
  const { page, eventId } = useNav();
  // Visitors see the landing page (at #/welcome, or with no page in the URL); every other page
  // needs an account, and asks for one in place. Signed in, the landing page is skipped.
  const landing = !user && (page === "welcome" || (!page && !eventId && !shared));
  const signIn = !user && !landing;
  useEventRoute(landing || signIn);
  useNewEventAfterSignIn();

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
          {landing ? <Landing /> : signIn ? <SignIn /> : plan ? <Dashboard /> : <Onboarding />}
        </Suspense>
      )}
      <Toaster />
    </>
  );
}
