// Dashboard frame: sidebar (event switcher, Add menu, sections), top bar (command bar,
// share, print) and a bottom nav on phones, where the switcher moves to the top bar.

import { useState, type ReactNode } from "react";
import {
  CalendarCheck, ClipboardList, Download, Lightbulb, LayoutDashboard, PencilLine, Plus, Printer, ReceiptIndianRupee,
  Share2, Store, Undo2, UserPlus, Users, Wallet, X, type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/common";
import { formatDate, inr, plural, shortInr } from "@/lib/format";
import { buildShareUrl } from "@/lib/share";
import { needsAction } from "@/lib/tasks";
import { cn } from "@/lib/utils";
import { routeHash, useNav, type Intent, type Section } from "@/state/nav";
import { usePlan } from "@/state/planner";
import { CommandBar } from "./command-bar";
import { EventSwitcher } from "./event-switcher";

const NAV: { id: Section; label: string; icon: LucideIcon }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "budget", label: "Budget", icon: Wallet },
  { id: "tasks", label: "Tasks", icon: ClipboardList },
  { id: "vendors", label: "Vendors", icon: Store },
  { id: "guests", label: "Guests", icon: Users },
  { id: "ideas", label: "Ideas", icon: Lightbulb },
];

export const expectedGuests = (guests: { party: number; rsvp: string }[]) =>
  guests.filter((g) => g.rsvp === "yes" || g.rsvp === "maybe").reduce((sum, g) => sum + g.party, 0);

const PILL = "num rounded-full bg-surface px-2 py-0.5 text-xs font-medium text-muted-foreground";

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
  return (
    <div className="flex items-center gap-2.5">
      <span className="font-display grid size-10 place-items-center rounded-[10px] bg-primary-soft text-xl text-primary-ink" aria-hidden="true">H</span>
      <div className="leading-tight">
        <p className="font-display text-lg">Higgins AI</p>
        <p className="text-xs text-muted-foreground">Event planner</p>
      </div>
    </div>
  );
}

function EventCard() {
  const { inputs, plan } = usePlan();
  return (
    <div className="rounded-xl bg-surface p-1.5 text-sm shadow-card">
      <EventSwitcher className="w-full p-2.5 hover:bg-surface-soft data-[state=open]:bg-surface-soft" />
      <div className="num mx-2.5 mt-1 mb-2.5 grid grid-cols-2 gap-y-1.5 border-t pt-3 text-xs text-muted-foreground">
        <span className="col-span-2">{formatDate(inputs.event_date)}</span>
        <span>{plural(inputs.guests, "guest")}</span>
        <span className="text-right font-semibold text-foreground">{inr(inputs.budget_inr)}</span>
        <span>{inr(plan.per_guest_inr)} / guest</span>
        <span className="text-right">
          <StatusBadge tone={plan.budget_status === "ok" ? "success" : "danger"}>{plan.budget_status === "ok" ? "Budget fine" : "Budget tight"}</StatusBadge>
        </span>
      </div>
    </div>
  );
}

function ShareButton() {
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
      <Button variant="outline" onClick={share}><Share2 aria-hidden="true" /> <span className="hidden sm:inline">Share with family</span></Button>
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

function UndoBar() {
  const { lastChange, undo } = usePlan();
  const [hidden, setHidden] = useState<object | null>(null);
  if (!lastChange || hidden === lastChange) return null;
  return (
    <div className="no-print flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-card px-4 py-2.5 text-sm shadow-card" role="status">
      <StatusBadge tone="success">Done</StatusBadge>
      <span className="min-w-0 flex-1">
        <span className="font-medium">{lastChange.label}</span>
        {lastChange.summary.length > 0 && <span className="text-muted-foreground"> · {lastChange.summary.join(" ")}</span>}
      </span>
      <Button size="sm" variant="outline" onClick={undo}><Undo2 aria-hidden="true" /> Undo</Button>
      <Button size="icon-sm" variant="ghost" onClick={() => setHidden(lastChange)} aria-label="Hide"><X aria-hidden="true" /></Button>
    </div>
  );
}

export function Shell({ children, onEdit, onPrint }: { children: ReactNode; onEdit: () => void; onPrint: () => void }) {
  const { section, eventId, go } = useNav();
  const { shared, keepSharedPlan, activeId } = usePlan();
  const counts = useCounts();

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
            ? "flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium"
            : "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium",
          active ? "bg-primary-soft font-semibold text-primary" : "text-foreground/80 hover:bg-surface",
        )}
      >
        <Icon className="size-4.5 shrink-0" aria-hidden="true" />
        <span className={compact ? "" : "flex-1"}>{item.label}</span>
        {!compact && counts[item.id]}
      </a>
    );
  };

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[260px_1fr]">
      <a href="#main" className="sr-only z-50 rounded bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
        Skip to content
      </a>

      <aside className="no-print sticky top-0 hidden h-screen flex-col gap-5 overflow-y-auto bg-surface-soft p-5 lg:flex">
        <Logo />
        <EventCard />
        <AddMenu className="w-full" />
        <nav aria-label="Sections" className="flex flex-col gap-0.5">{NAV.map((item) => navLink(item))}</nav>
        <div className="mt-auto space-y-0.5 border-t pt-3">
          <button onClick={onEdit} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-muted">
            <PencilLine className="size-4" aria-hidden="true" /> Edit event details
          </button>
          <p className="px-3 pt-2 text-xs text-muted-foreground">Saved in this browser only. Nothing goes to our server.</p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col pb-20 lg:pb-0">
        <header className="no-print sticky top-0 z-30 bg-background/85 backdrop-blur">
          <div className="flex flex-wrap items-center gap-2 px-4 py-3 md:flex-nowrap md:px-8">
            <EventSwitcher className="flex-1 px-2 py-1.5 hover:bg-surface data-[state=open]:bg-surface md:w-60 md:flex-none lg:hidden" />
            {/* A fresh bar per event, so a half-typed change never applies to another one. */}
            <div className="order-last w-full md:order-none md:w-auto md:flex-1"><CommandBar key={activeId} /></div>
            <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
              <AddMenu className="max-sm:w-9 max-sm:px-0 lg:hidden" />
              <Button variant="ghost" size="icon" onClick={onEdit} className="lg:hidden" aria-label="Edit event details" title="Edit event details"><PencilLine aria-hidden="true" /></Button>
              <ShareButton />
              <Button variant="ghost" size="icon" onClick={onPrint} aria-label="Print or save as PDF" title="Print or save as PDF"><Printer aria-hidden="true" /></Button>
            </div>
          </div>
        </header>

        <main id="main" className="mx-auto w-full max-w-[1400px] flex-1 space-y-6 px-4 py-6 md:px-10 md:py-8">
          {shared && (
            <div className="no-print flex flex-wrap items-center gap-3 rounded-xl bg-info-soft px-4 py-3 text-sm">
              <Download className="size-4 text-info" aria-hidden="true" />
              <span className="flex-1">Someone shared this plan with you. Keep it to add it to your events. Your own plans stay as they are.</span>
              <Button size="sm" variant="outline" onClick={keepSharedPlan}>Keep this plan</Button>
            </div>
          )}
          <UndoBar />
          {children}
        </main>
      </div>

      <nav aria-label="Sections" className="no-print fixed inset-x-0 bottom-0 z-30 flex bg-surface shadow-raised lg:hidden">
        {NAV.map((item) => navLink(item, true))}
      </nav>
    </div>
  );
}
