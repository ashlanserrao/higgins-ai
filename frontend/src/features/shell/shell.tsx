// Dashboard frame: sidebar (event switcher, Add menu, sections), which folds to a rail of icons
// on a desktop, top bar (share, print), a bottom nav on phones, where the switcher moves to the
// top bar, and the Ask Higgins dock.

import { useRef, useState, type ReactNode, type Ref } from "react";
import {
  AlertTriangle, CalendarCheck, ClipboardList, Download, Lightbulb, LayoutDashboard, PanelLeftClose, PanelLeftOpen, PencilLine, Plus,
  Printer, ReceiptIndianRupee, Share2, Store, UserPlus, Users, Wallet, type LucideIcon,
} from "lucide-react";
import { LogoFull, LogoMark } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { PageBandTools } from "@/components/page-band";
import { inr, shortInr } from "@/lib/format";
import { expectedGuests } from "@/lib/guests";
import { buildShareUrl } from "@/lib/share";
import { needsAction } from "@/lib/tasks";
import { DESKTOP, useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";
import { routeHash, useNav, type Intent, type Section } from "@/state/nav";
import { usePlan } from "@/state/planner";
import { AskDock } from "./ask-dock";
import { EventSwitcher } from "./event-switcher";
import { ProfileMenu } from "./profile-menu";
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

/** `rail`: the folded sidebar's, an icon that opens to its right. */
function AddMenu({ className, rail = false }: { className?: string; rail?: boolean }) {
  const { go } = useNav();
  const items: { label: string; icon: LucideIcon; section: Section; intent: Intent }[] = [
    { label: "Add a quote", icon: ReceiptIndianRupee, section: "vendors", intent: "add-quote" },
    { label: "Mark a booking", icon: CalendarCheck, section: "tasks", intent: "mark-booking" },
    { label: "Add a guest", icon: UserPlus, section: "guests", intent: "add-guest" },
    { label: "Move money", icon: Wallet, section: "budget", intent: "move-money" },
  ];
  // A chosen item opens its tool with the first field focused. The menu holds focus until it
  // has fully closed, so the page changes only then; a menu closed without a choice hands
  // focus back to Add.
  const chosen = useRef<{ section: Section; intent: Intent } | null>(null);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size={rail ? "icon" : "default"} className={className} aria-label="Add" title={rail ? "Add" : undefined}>
          <Plus aria-hidden="true" /> {!rail && <span className="hidden sm:inline">Add</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start" side={rail ? "right" : undefined} className="w-56"
        onCloseAutoFocus={(event) => {
          if (!chosen.current) return;
          event.preventDefault();
          go(chosen.current.section, chosen.current.intent);
          chosen.current = null;
        }}
      >
        <DropdownMenuLabel>Something changed?</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.map(({ label, icon: Icon, section, intent }) => (
          <DropdownMenuItem key={label} onSelect={() => (chosen.current = { section, intent })}>
            <Icon aria-hidden="true" /> {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const COLLAPSED_KEY = "sidebar:collapsed";

/** Folded or not, remembered in this browser (storage can be blocked: then it lasts the visit). */
function useCollapsed() {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSED_KEY) === "1";
    } catch {
      return false;
    }
  });
  const toggle = () => {
    try {
      localStorage.setItem(COLLAPSED_KEY, collapsed ? "0" : "1");
    } catch {
      // Not remembered; it still folds.
    }
    setCollapsed(!collapsed);
  };
  return [collapsed, toggle] as const;
}

/** The brand, which opens the event's overview (signed in, the landing page is behind you). */
function Logo({ toggleRef, onCollapse }: { toggleRef: Ref<HTMLButtonElement>; onCollapse: () => void }) {
  const { eventId, go } = useNav();
  return (
    <div className="flex items-center gap-2">
      <a
        href={routeHash({ eventId, section: "overview" })}
        onClick={(e) => {
          e.preventDefault();
          go("overview");
        }}
        className="flex min-w-0 flex-1 items-center rounded-lg"
      >
        <LogoFull />
      </a>
      <Button
        ref={toggleRef} variant="ghost" size="icon-sm" onClick={onCollapse}
        aria-label="Collapse sidebar" title="Collapse sidebar" aria-expanded aria-controls="sidebar"
        className="text-muted-foreground hover:text-foreground"
      >
        <PanelLeftClose aria-hidden="true" />
      </Button>
    </div>
  );
}

/** The folded sidebar's logo: pointing at it or focusing it shows that it expands the sidebar.
 *  Pointer events, not CSS hover, so it also shows on laptops that report touch only. */
function RailLogo({ toggleRef, onExpand }: { toggleRef: Ref<HTMLButtonElement>; onExpand: () => void }) {
  const [hinted, setHinted] = useState(false);
  return (
    <button
      ref={toggleRef} type="button" onClick={onExpand}
      onPointerEnter={() => setHinted(true)} onPointerLeave={() => setHinted(false)}
      onFocus={() => setHinted(true)} onBlur={() => setHinted(false)}
      aria-label="Expand sidebar" title="Expand sidebar" aria-expanded={false} aria-controls="sidebar"
      className="grid size-10 shrink-0 place-items-center rounded-[10px] text-muted-foreground hover:bg-surface"
    >
      {hinted ? <PanelLeftOpen className="size-5" aria-hidden="true" /> : <LogoMark className="size-9" />}
    </button>
  );
}

/** The open event, and a link to the budget only when it needs a look (tight or over). The
 *  numbers themselves live on the Overview band and the Budget page. `rail`: the folded
 *  sidebar's, the event's dot and a warning icon. */
function EventCard({ rail = false }: { rail?: boolean }) {
  const { plan } = usePlan();
  const { eventId, go } = useNav();
  const over = plan.rebalance?.over_budget_inr ?? 0;
  const warning = over ? `Over budget by ${inr(over)}` : "Budget tight";
  const budgetLink = plan.budget_status !== "ok" && (
    <a
      href={routeHash({ eventId, section: "budget" })}
      onClick={(e) => {
        e.preventDefault();
        go("budget");
      }}
      aria-label={rail ? warning : undefined} title={rail ? warning : undefined}
      className={rail
        ? "grid size-8 place-items-center rounded-full bg-warning-soft text-warning"
        : "mx-2.5 mb-2.5 inline-flex items-start gap-1.5 rounded-full bg-warning-soft px-2.5 py-1 text-xs font-semibold text-warning hover:underline"}
    >
      <AlertTriangle className={rail ? "size-3.5" : "mt-px size-3.5 shrink-0"} aria-hidden="true" />
      {!rail && warning}
    </a>
  );
  return rail ? (
    <div className="flex flex-col items-center gap-2">
      <EventSwitcher variant="rail" className="size-10 justify-center rounded-xl border bg-surface hover:bg-surface-soft data-[state=open]:bg-surface-soft" />
      {budgetLink}
    </div>
  ) : (
    <div className="rounded-xl border bg-surface p-1.5 text-sm">
      <EventSwitcher variant="card" className="w-full p-2.5 hover:bg-surface-soft data-[state=open]:bg-surface-soft" />
      {budgetLink}
    </div>
  );
}

/** `tone="band"`: white on the Overview's coloured band. */
function ShareButton({ tone }: { tone?: "band" }) {
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
          className="rounded-full border-primary-foreground/30 bg-transparent text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground"
        >
          <Share2 aria-hidden="true" /> <span className="xl:hidden">Share</span><span className="hidden xl:inline">Share with family</span>
        </Button>
      ) : (
        <Button variant="outline" onClick={share} aria-label="Share with family"><Share2 aria-hidden="true" /> <span className="hidden sm:inline">Share with family</span></Button>
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

/** On a desktop the page band carries these instead of the top bar. `onPrint` prints or saves
 *  the whole plan (App renders every section first). */
function BandTools({ onPrint }: { onPrint: () => void }) {
  return (
    <>
      <ShareButton tone="band" />
      <Button
        variant="ghost" size="icon" onClick={onPrint} aria-label="Print or save as PDF" title="Print or save as PDF"
        className="text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground"
      >
        <Printer aria-hidden="true" />
      </Button>
    </>
  );
}

export function Shell({ children, onEdit, onPrint }: { children: ReactNode; onEdit: () => void; onPrint: () => void }) {
  const { section, eventId, go } = useNav();
  const { shared, keepSharedPlan, activeId } = usePlan();
  const counts = useCounts();
  const [collapsed, toggleSidebar] = useCollapsed();
  // The fold's button changes places as it folds, so focus follows it.
  const toggleButton = useRef<HTMLButtonElement>(null);
  const toggle = () => {
    toggleSidebar();
    window.requestAnimationFrame(() => toggleButton.current?.focus());
  };
  // On a desktop each page's band carries Share and Print, so the top bar
  // steps aside and the band starts at the top of the page.
  const desktop = useMediaQuery(DESKTOP);

  const navLink = (item: (typeof NAV)[number], compact = false) => {
    const Icon = item.icon;
    const active = section === item.id;
    if (collapsed && !compact) return (
      <a
        key={item.id}
        href={routeHash({ eventId, section: item.id })}
        onClick={(e) => {
          e.preventDefault();
          go(item.id);
        }}
        aria-current={active ? "page" : undefined}
        title={item.label}
        className={cn("relative grid size-10 place-items-center rounded-lg", active ? "bg-primary-soft" : "hover:bg-surface")}
      >
        <span className={cn("grid size-[26px] place-items-center rounded-lg", active ? "bg-primary text-primary-foreground" : item.chip)} aria-hidden="true">
          <Icon className="size-3.5" />
        </span>
        <span className="sr-only">{item.label}{counts[item.id] && <>, {counts[item.id]}</>}</span>
        {/* Only what needs attention keeps a mark when the counts fold away. */}
        {item.id === "tasks" && counts.tasks && <span className="absolute top-1 right-1 size-2 rounded-full bg-warning ring-2 ring-surface-soft" aria-hidden="true" />}
      </a>
    );
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
    <div
      className={cn(
        "min-h-screen lg:grid lg:grid-cols-[var(--sidebar-w)_1fr] lg:transition-[grid-template-columns] lg:duration-200 lg:ease-out",
        // The dock reads the width too, to stay beside the sidebar.
        collapsed ? "[--sidebar-w:72px]" : "[--sidebar-w:260px]",
      )}
    >
      <a href="#main" className="sr-only z-50 rounded bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
        Skip to content
      </a>

      <aside id="sidebar" className="sticky top-0 hidden h-screen flex-col bg-surface-soft lg:flex">
        {/* Everything but the account scrolls; the account stays at the foot. */}
        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col gap-5 overflow-x-hidden overflow-y-auto",
            // The rail still scrolls on a very short window, without a scrollbar beside its icons.
            collapsed ? "items-center px-3 py-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" : "scroll-area p-5",
          )}
        >
          {collapsed ? <RailLogo toggleRef={toggleButton} onExpand={toggle} /> : <Logo toggleRef={toggleButton} onCollapse={toggle} />}
          <EventCard rail={collapsed} />
          <AddMenu rail={collapsed} className={collapsed ? "size-10" : "w-full"} />
          <nav aria-label="Sections" className={cn("flex flex-col", collapsed ? "gap-1" : "gap-0.5")}>{NAV.map((item) => navLink(item))}</nav>
          {/* Editing the event and the theme wait for the full sidebar. */}
          {!collapsed && (
            <div className="mt-auto space-y-0.5 border-t pt-3">
              <button type="button" onClick={onEdit} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-muted">
                <PencilLine className="size-4" aria-hidden="true" /> Edit event details
              </button>
              <AppearanceControl />
              <p className="px-3 pt-2 text-xs text-muted-foreground">Saved in this browser only. Our server doesn't keep a copy.</p>
            </div>
          )}
        </div>
        <div className={cn("shrink-0 border-t", collapsed ? "flex justify-center p-3" : "px-3 py-2.5")}>
          <ProfileMenu variant={collapsed ? "rail" : "sidebar"} />
        </div>
      </aside>

      <div className="@container flex min-w-0 flex-col pb-20 lg:pb-0">
        {!desktop && <header className="sticky top-0 z-30 bg-background/85 backdrop-blur">
          <div className="page-pad flex flex-wrap items-center gap-2 py-3 lg:flex-nowrap">
            <EventSwitcher withAppearance className="flex-1 px-2 py-1.5 hover:bg-surface data-[state=open]:bg-surface lg:hidden" />
            <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
              <AddMenu className="max-sm:w-9 max-sm:px-0 lg:hidden" />
              <Button variant="ghost" size="icon" onClick={onEdit} className="lg:hidden" aria-label="Edit event details" title="Edit event details"><PencilLine aria-hidden="true" /></Button>
              <ShareButton />
              <Button variant="ghost" size="icon" onClick={onPrint} aria-label="Print or save as PDF" title="Print or save as PDF"><Printer aria-hidden="true" /></Button>
              <ProfileMenu variant="bar" />
            </div>
          </div>
        </header>}

        {/* Room at the foot for the Ask Higgins circle, so the last content scrolls clear of it. */}
        <main id="main" className="page-pad w-full flex-1 space-y-6 pb-24">
          {shared && (
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-info-soft px-4 py-3 text-sm md:mt-6">
              <Download className="size-4 text-info" aria-hidden="true" />
              <span className="flex-1">Someone shared this plan with you. Keep it to add it to your events. Your own plans stay as they are.</span>
              <Button size="sm" variant="outline" onClick={keepSharedPlan}>Keep this plan</Button>
            </div>
          )}
          <PageBandTools value={desktop ? <BandTools onPrint={onPrint} /> : null}>{children}</PageBandTools>
        </main>
      </div>

      <nav aria-label="Sections" className="fixed inset-x-0 bottom-0 z-30 flex border-t bg-surface lg:hidden">
        {NAV.map((item) => navLink(item, true))}
      </nav>
      {/* A fresh dock per event, so a half-typed change never applies to another one. */}
      <AskDock key={activeId} />
    </div>
  );
}
