// Dashboard frame: sidebar (event switcher, Add menu, sections), top bar (command bar,
// share, print) and a bottom nav on phones, where the switcher moves to the top bar.

import { createContext, useContext, useState, type ReactNode } from "react";
import {
  AlertTriangle, CalendarCheck, ClipboardList, Download, Lightbulb, LayoutDashboard, PencilLine, Plus, Printer, ReceiptIndianRupee,
  Share2, Store, UserPlus, Users, Wallet, type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { inr, shortInr } from "@/lib/format";
import { buildShareUrl } from "@/lib/share";
import { needsAction } from "@/lib/tasks";
import { DESKTOP, useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";
import { routeHash, useNav, type Intent, type Section } from "@/state/nav";
import { usePlan } from "@/state/planner";
import { CommandBar } from "./command-bar";
import { EventSwitcher } from "./event-switcher";
import { AppearanceControl } from "./theme-control";

// Each section's icon sits on its own soft chip in the sidebar, tinted from the semantic tokens
// (each has a dark-theme value); the open section's chip fills with the event accent.
const NAV: { id: Section; label: string; icon: LucideIcon; chip: string }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard, chip: "bg-surface text-muted-foreground" },
  { id: "budget", label: "Budget", icon: Wallet, chip: "bg-danger-soft text-danger" },
  { id: "tasks", label: "Tasks", icon: ClipboardList, chip: "bg-success-soft text-success" },
  { id: "vendors", label: "Vendors", icon: Store, chip: "bg-warning-soft text-warning" },
  { id: "guests", label: "Guests", icon: Users, chip: "bg-info-soft text-info" },
  { id: "ideas", label: "Ideas", icon: Lightbulb, chip: "bg-ai-tint text-ai" },
];

export const expectedGuests = (guests: { party: number; rsvp: string }[]) =>
  guests.filter((g) => g.rsvp === "yes" || g.rsvp === "maybe").reduce((sum, g) => sum + g.party, 0);

const PILL = "num rounded-full bg-surface px-2 py-0.5 text-xs font-medium whitespace-nowrap text-muted-foreground";

function useCounts(): Record<Section, ReactNode> {
  const { plan, guests, inputs } = usePlan();
  const urgent = plan.checklist.filter(needsAction).length;
  const confirmed = plan.budget_lines.filter((l) => l.source === "confirmed").length;
  return {
    overview: null,
    budget: <span className={PILL}>{shortInr(inputs.budget_inr)}</span>,
    // Only something that needs attention gets colour.
    tasks: urgent ? <span className={cn(PILL, "bg-warning-soft text-warning")}>{urgent}<span className="sr-only"> need you</span></span> : null,
    vendors: confirmed ? <span className={PILL}>{confirmed} confirmed</span> : null,
    guests: guests.length ? <span className={PILL}>{expectedGuests(guests)}<span className="sr-only"> expected</span></span> : null,
    ideas: null,
  };
}

function AddMenu({ className }: { className?: string }) {
  const { go } = useNav();
  const items: { label: string; icon: LucideIcon; section: Section; intent: Intent }[] = [
    { label: "Add a quote", icon: ReceiptIndianRupee, section: "vendors", intent: "add-quote" },
    { label: "Mark a booking", icon: CalendarCheck, section: "tasks", intent: "mark-booking" },
    { label: "Add a guest", icon: UserPlus, section: "guests", intent: "add-guest" },
    { label: "Move money", icon: Wallet, section: "budget", intent: "move-money" },
  ];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className={className} aria-label="Add"><Plus aria-hidden="true" /> <span className="hidden sm:inline">Add</span></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Something changed?</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.map(({ label, icon: Icon, section, intent }) => (
          <DropdownMenuItem key={label} onSelect={() => go(section, intent)}>
            <Icon aria-hidden="true" /> {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Logo() {
  const { openPage } = useNav();
  return (
    <a
      href="#/welcome"
      onClick={(e) => {
        e.preventDefault();
        openPage("welcome");
      }}
      className="flex items-center gap-2.5 rounded-lg"
      aria-label="Higgins AI home"
    >
      <span className="font-display grid size-10 place-items-center rounded-[10px] bg-primary-soft text-xl text-primary-ink" aria-hidden="true">H</span>
      <div className="leading-tight">
        <p className="font-display text-lg">Higgins AI</p>
        <p className="text-xs text-muted-foreground">Event planner</p>
      </div>
    </a>
  );
}

/** The open event, and a link to the budget only when it needs a look (tight or over). The
 *  numbers themselves live on the Overview band and the Budget page. */
function EventCard() {
  const { plan } = usePlan();
  const { eventId, go } = useNav();
  const over = plan.rebalance?.over_budget_inr ?? 0;
  return (
    <div className="rounded-xl bg-surface p-1.5 text-sm shadow-card">
      <EventSwitcher variant="card" className="w-full p-2.5 hover:bg-surface-soft data-[state=open]:bg-surface-soft" />
      {plan.budget_status !== "ok" && (
        <a
          href={routeHash({ eventId, section: "budget" })}
          onClick={(e) => {
            e.preventDefault();
            go("budget");
          }}
          className="mx-2.5 mb-2.5 inline-flex items-start gap-1.5 rounded-full bg-warning-soft px-2.5 py-1 text-xs font-semibold text-warning hover:underline"
        >
          <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          {over ? `Over budget by ${inr(over)}` : "Budget tight"}
        </a>
      )}
    </div>
  );
}

/** Print or save the whole plan (App renders every section first). */
const PrintContext = createContext<() => void>(() => window.print());
export const usePrint = () => useContext(PrintContext);

/** `tone="band"`: white on the Overview's coloured band. */
export function ShareButton({ tone }: { tone?: "band" }) {
  const { inputs, plannedOn, ideas, ideasStatus, announce } = usePlan();
  const [url, setUrl] = useState("");
  const share = async () => {
    const link = await buildShareUrl(inputs, plannedOn, ideasStatus === "ready" ? ideas : null);
    try {
      if (navigator.share) {
        await navigator.share({ title: "Our event plan", url: link });
        return;
      }
      await navigator.clipboard.writeText(link);
      announce("Link copied. Paste it into WhatsApp or email.");
    } catch {
      setUrl(link);
    }
  };
  return (
    <>
      {tone === "band" ? (
        <Button
          variant="outline" onClick={share}
          className="rounded-full border-primary-foreground/30 bg-transparent text-primary-foreground shadow-none hover:bg-primary-foreground/15 hover:text-primary-foreground"
        >
          <Share2 aria-hidden="true" /> <span className="xl:hidden">Share</span><span className="hidden xl:inline">Share with family</span>
        </Button>
      ) : (
        <Button variant="outline" onClick={share}><Share2 aria-hidden="true" /> <span className="hidden sm:inline">Share with family</span></Button>
      )}
      <Dialog open={Boolean(url)} onOpenChange={(o) => !o && setUrl("")}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share this plan</DialogTitle>
            <DialogDescription>The link holds the plan and ideas only. Your notes, bookings, quotes and guest list stay with you.</DialogDescription>
          </DialogHeader>
          <Input readOnly value={url} onFocus={(e) => e.target.select()} aria-label="Shareable link" />
        </DialogContent>
      </Dialog>
    </>
  );
}

export function Shell({ children, onEdit, onPrint }: { children: ReactNode; onEdit: () => void; onPrint: () => void }) {
  const { section, eventId, go } = useNav();
  const { shared, keepSharedPlan, activeId } = usePlan();
  const counts = useCounts();
  // On a desktop each page's band carries the command bar, Share and Print, so the top bar
  // steps aside and the band starts at the top of the page.
  const desktop = useMediaQuery(DESKTOP);

  const navLink = (item: (typeof NAV)[number], compact = false) => {
    const Icon = item.icon;
    const active = section === item.id;
    return (
      <a
        key={item.id}
        href={routeHash({ eventId, section: item.id })}
        onClick={(e) => {
          e.preventDefault();
          go(item.id);
        }}
        aria-current={active ? "page" : undefined}
        className={cn(
          compact
            ? "flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium"
            : "flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm font-medium pointer-coarse:min-h-11",
          compact
            ? active ? "bg-primary-soft font-semibold text-primary-text" : "text-foreground/80 hover:bg-surface"
            : active ? "bg-primary-soft font-semibold text-primary-ink" : "text-foreground/80 hover:bg-surface",
        )}
      >
        {compact ? (
          <Icon className="size-4.5 shrink-0" aria-hidden="true" />
        ) : (
          <span className={cn("grid size-[26px] shrink-0 place-items-center rounded-lg", active ? "bg-primary text-primary-foreground" : item.chip)} aria-hidden="true">
            <Icon className="size-3.5" />
          </span>
        )}
        <span className={compact ? "" : "min-w-0 flex-1"}>{item.label}</span>
        {!compact && counts[item.id]}
      </a>
    );
  };

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[260px_1fr]">
      <a href="#main" className="sr-only z-50 rounded bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
        Skip to content
      </a>

      <aside className="no-print sticky top-0 hidden h-screen flex-col gap-5 scroll-area overflow-y-auto bg-surface-soft p-5 lg:flex">
        <Logo />
        <EventCard />
        <AddMenu className="w-full" />
        <nav aria-label="Sections" className="flex flex-col gap-0.5">{NAV.map((item) => navLink(item))}</nav>
        <div className="mt-auto space-y-0.5 border-t pt-3">
          <button onClick={onEdit} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-muted">
            <PencilLine className="size-4" aria-hidden="true" /> Edit event details
          </button>
          <AppearanceControl />
          <p className="px-3 pt-2 text-xs text-muted-foreground">Saved in this browser only. Our server doesn't keep a copy.</p>
        </div>
      </aside>

      <div className="@container flex min-w-0 flex-col pb-20 lg:pb-0">
        {!desktop && <header className="no-print sticky top-0 z-30 bg-background/85 backdrop-blur">
          <div className="page-pad flex flex-wrap items-center gap-2 py-3 lg:flex-nowrap">
            <EventSwitcher withAppearance className="flex-1 px-2 py-1.5 hover:bg-surface data-[state=open]:bg-surface lg:hidden" />
            {/* A fresh bar per event, so a half-typed change never applies to another one. */}
            <div className="order-last w-full lg:order-none lg:w-auto lg:flex-1"><CommandBar key={activeId} /></div>
            <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
              <AddMenu className="max-sm:w-9 max-sm:px-0 lg:hidden" />
              <Button variant="ghost" size="icon" onClick={onEdit} className="lg:hidden" aria-label="Edit event details" title="Edit event details"><PencilLine aria-hidden="true" /></Button>
              <ShareButton />
              <Button variant="ghost" size="icon" onClick={onPrint} aria-label="Print or save as PDF" title="Print or save as PDF"><Printer aria-hidden="true" /></Button>
            </div>
          </div>
        </header>}

        <main id="main" className="page-pad w-full flex-1 space-y-6 pb-6 md:pb-8">
          {shared && (
            <div className="no-print mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-info-soft px-4 py-3 text-sm md:mt-6">
              <Download className="size-4 text-info" aria-hidden="true" />
              <span className="flex-1">Someone shared this plan with you. Keep it to add it to your events. Your own plans stay as they are.</span>
              <Button size="sm" variant="outline" onClick={keepSharedPlan}>Keep this plan</Button>
            </div>
          )}
          <PrintContext value={onPrint}>{children}</PrintContext>
        </main>
      </div>

      <nav aria-label="Sections" className="no-print fixed inset-x-0 bottom-0 z-30 flex bg-surface shadow-raised lg:hidden">
        {NAV.map((item) => navLink(item, true))}
      </nav>
    </div>
  );
}
