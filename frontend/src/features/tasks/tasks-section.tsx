// Bookings with their state (booked / delayed / waiting / at risk) and the timeline.

import { useEffect, useRef, useState } from "react";
import { CalendarClock, CalendarDays, CheckCircle2, Clock, Flag, Link2, MessageSquareText, MoreHorizontal, RotateCcw, Sparkle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/badges";
import { Panel } from "@/components/layout";
import { PageBand } from "@/components/page-band";
import { MessageDialog } from "@/components/app/message-dialog";
import { formatDate, plural } from "@/lib/format";
import { canMessage, needsAction, TIMELINE_STATUS, taskBadge, taskLabel, taskShortName } from "@/lib/tasks";
import type { ChecklistItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useNav } from "@/state/nav";
import { usePlan } from "@/state/planner";
import { BookingDialog, type BookingTarget } from "@/components/app/booking-dialog";

function TaskDetails({ item }: { item: ChecklistItem }) {
  const { plan } = usePlan();
  const lines: string[] = [];
  if (item.done && item.booked_on) lines.push(`Booked on ${formatDate(item.booked_on)}`);
  if (!item.done) lines.push(`Book by ${formatDate(item.book_by)} · usually ${item.lead_days} days ahead`);
  if (item.expected_on && !item.done) {
    const cause = item.delayed_by === item.id ? "when the vendor can confirm" : `because the ${taskShortName(taskLabel(plan, item.delayed_by ?? ""))} moved`;
    lines.push(`Now ${formatDate(item.expected_on)}, ${cause}`);
  }
  if (item.waiting_on.length) {
    const names = item.waiting_on.map((id) => taskShortName(taskLabel(plan, id))).join(", ");
    lines.push(item.done ? `Booked before the ${names}` : `Needs the ${names} first`);
  }
  return (
    <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
      {lines.map((line) => <li key={line}>{line}</li>)}
    </ul>
  );
}

function TaskRow({ item, onBook, onMessage, onClear }: {
  item: ChecklistItem; onBook: (t: BookingTarget) => void; onMessage: (id: string) => void; onClear: (item: ChecklistItem) => void;
}) {
  const badge = taskBadge(item);
  const tracked = item.done || item.delayed_by === item.id;
  // A small celebration when a booking is marked done (not for ones already done on load).
  const wasDone = useRef(item.done);
  const celebrate = item.done && !wasDone.current;
  return (
    <li className={cn("flex flex-wrap items-start gap-3 rounded-lg border bg-card p-4 md:flex-nowrap", badge.tone === "danger" && "border-danger-border", item.done && "bg-surface-soft")}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className={cn("font-sans text-sm font-semibold", item.done && "text-muted-foreground")}>{item.label}</h3>
          {item.essential && <span className="rounded-full bg-surface-soft px-2 text-xs text-muted-foreground">Essential</span>}
        </div>
        <TaskDetails item={item} />
      </div>
      <div className="flex items-center gap-2">
        <span className="relative">
          <StatusBadge tone={badge.tone} className={cn(celebrate && "animate-celebrate")}>{badge.label}</StatusBadge>
          {celebrate && <Sparkle className="animate-sparkle absolute -top-2 -right-2 size-4 fill-marigold text-marigold" aria-hidden="true" />}
        </span>
        {!item.done && (
          <Button size="sm" variant="outline" onClick={() => onBook({ taskId: item.id, state: "booked" })} className="no-print">
            <CheckCircle2 aria-hidden="true" /> Mark booked
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon-sm" variant="ghost" aria-label={`More for ${item.label}`} className="no-print"><MoreHorizontal aria-hidden="true" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {!item.done && <DropdownMenuItem onSelect={() => onBook({ taskId: item.id, state: "delayed" })}><CalendarClock aria-hidden="true" /> Vendor needs more time…</DropdownMenuItem>}
            {canMessage(item.id) && <DropdownMenuItem onSelect={() => onMessage(item.id)}><MessageSquareText aria-hidden="true" /> Message the vendor</DropdownMenuItem>}
            {tracked && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => onClear(item)}><RotateCcw aria-hidden="true" /> {item.done ? "Not booked after all" : "Clear the delay"}</DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}

export function Timeline({ limit }: { limit?: number }) {
  const { plan } = usePlan();
  const entries = limit ? plan.timeline.filter((e) => e.status !== "done").slice(0, limit) : plan.timeline;
  return (
    <ol className="relative space-y-3 border-l pl-5">
      {entries.map((entry) => {
        const status = TIMELINE_STATUS[entry.status];
        const Icon = entry.kind === "event" ? Flag : entry.kind === "milestone" ? CalendarDays : Clock;
        return (
          <li key={`${entry.date}-${entry.label}`} className="relative">
            <span className={cn("absolute top-1 -left-[27px] grid size-3.5 place-items-center rounded-full border-2 bg-card", entry.kind === "event" ? "border-primary bg-primary" : entry.status === "done" ? "border-marigold bg-marigold" : "border-input")} aria-hidden="true" />
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <time dateTime={entry.date} className="num w-24 text-xs font-medium text-muted-foreground">{formatDate(entry.date)}</time>
              <span className={cn("flex items-center gap-1.5 text-sm", entry.kind === "event" && "font-display text-base")}>
                <Icon className="size-3.5 text-muted-foreground" aria-hidden="true" /> {entry.label}
              </span>
              {entry.kind !== "event" && <StatusBadge tone={status.tone}>{status.label}</StatusBadge>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function TasksSection() {
  const { plan, updateProgress, fail } = usePlan();
  const { consumeIntent } = useNav();
  const [filter, setFilter] = useState("all");
  const [booking, setBooking] = useState<BookingTarget | null>(null);
  const [messageFor, setMessageFor] = useState<string | null>(null);
  const [messageOpen, setMessageOpen] = useState(false);

  // From the Add menu: open "booked" for the most urgent open task.
  useEffect(() => {
    if (!consumeIntent("mark-booking")) return;
    const first = plan.checklist.find(needsAction) ?? plan.checklist.find((i) => !i.done);
    if (first) setBooking({ taskId: first.id, state: "booked" });
  }, [consumeIntent, plan.checklist]);

  const items = plan.checklist.filter((item) =>
    filter === "action" ? needsAction(item) : filter === "booked" ? item.done : filter === "open" ? !item.done : true);
  const counts = {
    action: plan.checklist.filter(needsAction).length,
    booked: plan.checklist.filter((i) => i.done).length,
  };

  const clear = (item: ChecklistItem) =>
    updateProgress((progress) => {
      delete progress.tasks[item.id];
      return progress;
    }, `${item.label}: ${item.done ? "back on your list" : "back to its usual date"}`).catch((error) => fail((error as Error).message));

  return (
    <div className="space-y-6">
      <PageBand
        eyebrow={`${counts.booked} of ${plural(plan.checklist.length, "booking")} done`}
        title="Tasks"
        description="Book each vendor before its book-by date. Mark what's booked or running late, and everything that depends on it adjusts on its own."
      />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Panel title="Bookings" icon={Link2}>
          <Tabs value={filter} onValueChange={setFilter} className="mb-4">
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="action">Needs you ({counts.action})</TabsTrigger>
              <TabsTrigger value="open">Open</TabsTrigger>
              <TabsTrigger value="booked">Booked ({counts.booked})</TabsTrigger>
            </TabsList>
          </Tabs>
          {items.length ? (
            <ul className="space-y-2">
              {items.map((item) => (
                <TaskRow key={item.id} item={item} onBook={setBooking} onClear={clear}
                  onMessage={(id) => { setMessageFor(id); setMessageOpen(true); }} />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Nothing here right now.</p>
          )}
          {plan.ignored_progress.length > 0 && (
            <p className="mt-4 text-xs text-muted-foreground">
              Saved progress for {plan.ignored_progress.join(", ")} isn't part of this plan, so it's ignored (kept in case you switch back).
            </p>
          )}
        </Panel>
        <Panel title="Timeline" icon={CalendarDays} description="Every step, right up to the day.">
          <Timeline />
        </Panel>
      </div>
      <BookingDialog target={booking} onClose={() => setBooking(null)} />
      <MessageDialog taskId={messageFor} open={messageOpen} onOpenChange={setMessageOpen} />
    </div>
  );
}
