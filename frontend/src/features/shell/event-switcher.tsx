// The event switcher: the open event at the top of the sidebar (and the phone header), and
// every saved event in a menu, a bottom sheet on phones. Each event keeps its own plan,
// bookings, quotes, guests and ideas. Switching keeps the section that's open.

import { useId, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronsUpDown, Ellipsis, PencilLine, Plus, SunMoon, Trash2 } from "lucide-react";
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuSub,
  DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { countdown, daysUntil, eventName, formatShortDate, plural, titleCase } from "@/lib/format";
import type { SavedEvent } from "@/lib/storage";
import { dueToday } from "@/lib/tasks";
import type { EventType } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme";
import { orderEvents, usePlan } from "@/state/planner";
import { AppearanceSheet, THEME_OPTIONS } from "./theme-control";

/** Each dot carries its own event's accent, whichever event the page is showing. */
function EventDot({ type }: { type: EventType }) {
  return <span data-event={type} className="size-2.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />;
}

/** "its plan and budget, 3 bookings and 40 guests on the list" */
function whatGoes(event: SavedEvent) {
  const { tasks, quotes, moves } = event.inputs.progress;
  const booked = Object.values(tasks).filter((t) => t.state === "booked").length;
  const parts = [
    "its plan and budget",
    booked && plural(booked, "booking"),
    quotes.length && plural(quotes.length, "quote"),
    moves.length && plural(moves.length, "money move"),
    event.guests.length && `${plural(event.guests.length, "guest")} on the list`,
    event.ideas && "its ideas",
  ].filter((part): part is string => Boolean(part));
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts[0];
}

function EventRow({ event, onRename, onDelete }: { event: SavedEvent; onRename: () => void; onDelete: () => void }) {
  const name = eventName(event);
  // A past event has nothing left to book, whatever its last saved plan says.
  const due = daysUntil(event.inputs.event_date) >= 0 ? event.plan?.checklist.filter(dueToday).length ?? 0 : 0;
  return (
    <div className="flex items-center gap-0.5">
      <DropdownMenuPrimitive.RadioItem
        value={event.id}
        textValue={name}
        className="flex min-w-0 flex-1 cursor-default items-center gap-3 rounded-lg px-2.5 py-2 text-sm outline-hidden select-none focus:bg-accent"
      >
        <EventDot type={event.inputs.event_type} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{name}</span>
          <span className="block truncate text-xs text-muted-foreground">{titleCase(event.inputs.city)} · {countdown(event.inputs.event_date)}</span>
        </span>
        {due > 0 && <span className="num shrink-0 rounded-full bg-warning-soft px-2 py-0.5 text-xs font-medium text-warning">{due} to do</span>}
        <span className="grid size-4 shrink-0 place-items-center">
          <DropdownMenuPrimitive.ItemIndicator><Check className="size-4 text-primary-text" aria-hidden="true" /></DropdownMenuPrimitive.ItemIndicator>
        </span>
      </DropdownMenuPrimitive.RadioItem>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger textValue="" aria-label={`More for ${name}`} className="size-9 shrink-0 justify-center p-0 [&>svg:last-child]:hidden">
          <Ellipsis aria-hidden="true" />
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="w-40">
          <DropdownMenuItem onSelect={onRename}><PencilLine aria-hidden="true" /> Rename</DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={onDelete}><Trash2 aria-hidden="true" /> Delete</DropdownMenuItem>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    </div>
  );
}

/** `withAppearance`: phones have no sidebar, so the theme choice lives in this menu there.
 *  `variant="card"`: the sidebar's, with room for the whole name and the date and guests. */
export function EventSwitcher({ className, withAppearance = false, variant }: { className?: string; withAppearance?: boolean; variant?: "card" }) {
  const { events, activeId, shared, inputs, switchEvent, startNewEvent, renameEvent, deleteEvent } = usePlan();
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState<SavedEvent | null>(null);
  const [deleting, setDeleting] = useState<SavedEvent | null>(null);
  const [appearance, setAppearance] = useState(false);
  const { resolved } = useTheme();
  const trigger = useRef<HTMLButtonElement>(null);
  const nameField = useId();
  const current = events.find((e) => e.id === activeId);

  // Dialogs open from the menu, which has closed by then: focus goes back to the switcher.
  const backToTrigger = (event: Event) => {
    event.preventDefault();
    trigger.current?.focus();
  };

  const saveName = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (renaming) renameEvent(renaming.id, String(new FormData(event.currentTarget).get("name") ?? ""));
    setRenaming(null);
  };

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger
          ref={trigger}
          className={cn("flex min-w-0 items-center gap-2 rounded-lg text-left transition-colors sm:gap-3", className)}
        >
          <EventDot type={inputs.event_type} />
          <span className="min-w-0 flex-1">
            <span className={cn("font-display block text-base leading-snug", variant === "card" ? "break-words" : "truncate")}>
              {current ? eventName(current) : "Shared plan"}
            </span>
            <span className="num block truncate text-xs text-muted-foreground">
              {variant === "card"
                ? `${formatShortDate(inputs.event_date)} · ${plural(inputs.guests, "guest")}${shared ? " · Not saved yet" : ""}`
                : `${titleCase(inputs.city)} · ${shared ? "Not saved yet" : countdown(inputs.event_date)}`}
            </span>
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="sr-only">, switch event</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          data-event-switcher=""
          className={cn(
            "w-(--radix-dropdown-menu-trigger-width) min-w-88 max-w-[calc(100vw-2rem)] rounded-xl p-1.5",
            // Phones: a bottom sheet (index.css pins it to the bottom edge).
            "max-md:max-h-[85vh] max-md:w-full max-md:max-w-none max-md:rounded-t-2xl max-md:rounded-b-none max-md:border-0 max-md:p-3 max-md:pb-[calc(env(safe-area-inset-bottom)+0.75rem)]",
          )}
        >
          <DropdownMenuLabel className="px-2.5 text-xs font-medium text-muted-foreground">Your events</DropdownMenuLabel>
          <DropdownMenuPrimitive.RadioGroup value={activeId ?? ""} onValueChange={switchEvent}>
            <div className="max-h-[min(24rem,55vh)] scroll-area overflow-y-auto">
              {orderEvents(events).map((event) => (
                <EventRow key={event.id} event={event} onRename={() => setRenaming(event)} onDelete={() => setDeleting(event)} />
              ))}
            </div>
          </DropdownMenuPrimitive.RadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={startNewEvent} className="gap-3 px-2.5 py-2">
            <Plus aria-hidden="true" /> Plan a new event
          </DropdownMenuItem>
          {withAppearance && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setAppearance(true)} className="gap-3 px-2.5 py-2">
                <SunMoon aria-hidden="true" /> Appearance: {THEME_OPTIONS.find((o) => o.value === resolved)?.label}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {open && createPortal(<div className="fixed inset-0 z-40 bg-black/30 md:hidden" aria-hidden="true" />, document.body)}

      {withAppearance && <AppearanceSheet open={appearance} onOpenChange={setAppearance} onCloseAutoFocus={backToTrigger} />}

      <Dialog open={Boolean(renaming)} onOpenChange={(o) => !o && setRenaming(null)}>
        <DialogContent onCloseAutoFocus={backToTrigger}>
          {renaming && (
            <form onSubmit={saveName} className="grid gap-5">
              <DialogHeader>
                <DialogTitle>Rename this event</DialogTitle>
                <DialogDescription>Leave it empty to call it “{eventName({ ...renaming, name: "" })}”.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-1.5">
                <Label htmlFor={nameField}>Event name</Label>
                <Input id={nameField} name="name" defaultValue={renaming.name} placeholder={eventName({ ...renaming, name: "" })} maxLength={60} autoFocus />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setRenaming(null)}>Cancel</Button>
                <Button type="submit">Save name</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleting)} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent onCloseAutoFocus={backToTrigger}>
          {deleting && (
            <>
              <DialogHeader>
                <DialogTitle className="break-words leading-snug">Delete “{eventName(deleting)}”?</DialogTitle>
                <DialogDescription>
                  This removes {whatGoes(deleting)} from this browser. You can undo it straight after.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDeleting(null)}>Keep it</Button>
                <Button variant="destructive" onClick={() => { deleteEvent(deleting.id); setDeleting(null); }}>Delete event</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
