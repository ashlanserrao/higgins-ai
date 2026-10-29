// The questionnaire as a page: a first event, or a new one. Lazy-loaded by App.

import { useEffect, useState } from "react";
import { CalendarCheck, PieChart, Share2, type LucideIcon } from "lucide-react";
import { Questionnaire } from "@/features/onboarding/questionnaire";
import { ProfileMenu } from "@/features/shell/profile-menu";
import { useNav } from "@/state/nav";
import { usePlanner } from "@/state/planner";

const YOU_GET: { icon: LucideIcon; label: string }[] = [
  { icon: PieChart, label: "A budget split" },
  { icon: CalendarCheck, label: "Book-by dates" },
  { icon: Share2, label: "A plan to share" },
];

export function Onboarding() {
  const { returnTo, events, cancelNewEvent } = usePlanner();
  const { draft, clearDraft } = useNav();
  const [initialText] = useState(draft);
  const canGoBack = events.some((e) => e.id === returnTo);
  useEffect(clearDraft, [clearDraft]);
  const brand = (
    <>
      <span className="font-display grid size-10 place-items-center rounded-[10px] bg-primary-soft text-xl text-primary-ink" aria-hidden="true">H</span>
      <span className="font-display text-lg">Higgins AI</span>
    </>
  );
  return (
    <div className="min-h-screen px-4 py-10 md:py-16">
      <header className="mx-auto mb-8 max-w-3xl">
        {/* Signed in, the landing page is behind you: the logo goes back to the event you came
            from, and is only a logo on a first event. */}
        <div className="mb-8 flex items-center justify-between gap-3">
          {canGoBack ? (
            <a
              href={`#/event/${returnTo}/overview`}
              onClick={(e) => {
                e.preventDefault();
                cancelNewEvent();
              }}
              className="inline-flex items-center gap-2.5 rounded-lg"
            >
              {brand}
            </a>
          ) : (
            <p className="inline-flex items-center gap-2.5">{brand}</p>
          )}
          {/* No sidebar here, so the account (and logging out) sits top right. */}
          <ProfileMenu variant="bar" />
        </div>
        <h1 className="text-3xl md:text-[2.75rem] md:leading-tight">Let's plan your celebration, calmly</h1>
        <p className="mt-3 max-w-2xl text-base text-muted-foreground md:text-lg">
          Weddings, birthdays and community events. In about a minute you'll have a realistic budget, book-by dates and a
          timeline to share with family, and it keeps up as quotes come in and plans change.
        </p>
        <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground" aria-label="What you'll get">
          {YOU_GET.map(({ icon: Icon, label }) => (
            <li key={label} className="flex items-center gap-1.5"><Icon className="size-4 text-primary-text" aria-hidden="true" /> {label}</li>
          ))}
        </ul>
      </header>
      <main><Questionnaire initialText={initialText} onCancel={canGoBack ? cancelNewEvent : undefined} /></main>
    </div>
  );
}
