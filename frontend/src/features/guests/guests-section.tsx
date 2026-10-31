// Guest list with RSVPs. Lives only in this browser: names never go to the server or into
// share links. The expected headcount can update the plan, with a before/after first.

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Lock, Search, Trash2, UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FieldError } from "@/components/field-error";
import { EmptyState, Panel, Stat } from "@/components/layout";
import { PageBand } from "@/components/page-band";
import { useChangePreview } from "@/components/app/use-change-preview";
import { plural } from "@/lib/format";
import type { Guest, Rsvp } from "@/lib/types";
import { useNav } from "@/state/nav";
import { usePlan } from "@/state/planner";
import { expectedGuests } from "@/lib/guests";

const RSVP_LABELS: Record<Rsvp, string> = { invited: "Invited", yes: "Coming", maybe: "Maybe", no: "Not coming" };

export function GuestsSection() {
  const { guests, setGuests, inputs } = usePlan();
  const { consumeIntent } = useNav();
  const { preview, dialog } = useChangePreview();
  const [name, setName] = useState("");
  const [group, setGroup] = useState("");
  const [party, setParty] = useState("1");
  const [rsvp, setRsvp] = useState<Rsvp>("invited");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const nameField = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (consumeIntent("add-guest")) nameField.current?.focus();
  }, [consumeIntent]);

  const count = (status: Rsvp) => guests.filter((g) => g.rsvp === status).reduce((sum, g) => sum + g.party, 0);
  const expected = expectedGuests(guests);
  const groups = [...new Set(guests.map((g) => g.group).filter(Boolean))];

  const add = (event: FormEvent) => {
    event.preventDefault();
    const size = Number(party);
    if (!name.trim()) return setError("Add a name first.");
    if (!Number.isInteger(size) || size < 1 || size > 50) return setError("Party size can be 1 to 50.");
    setError("");
    setGuests([...guests, { id: crypto.randomUUID(), name: name.trim(), group: group.trim(), party: size, rsvp }]);
    setName("");
    setParty("1");
    nameField.current?.focus();
  };

  const update = (id: string, change: Partial<Guest>) => setGuests(guests.map((g) => (g.id === id ? { ...g, ...change } : g)));
  const shown = guests.filter((g) => `${g.name} ${g.group}`.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="space-y-6">
      <PageBand
        eyebrow={`Planning for ${plural(inputs.guests, "guest")}`}
        title="Guests"
        description="Keep track of who's coming. Expected guests are everyone coming or maybe coming, with their party size."
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Expected" value={expected} hint="Coming + maybe" />
        <Stat label="Coming" value={count("yes")} />
        <Stat label="Maybe" value={count("maybe")} />
        <Stat label="Not replied" value={count("invited")} hint={`${count("no")} not coming`} />
      </div>
      {/* Only once someone is expected: a list of people not replied yet isn't a guest count. */}
      {expected > 0 && expected !== inputs.guests && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-info-soft px-4 py-3 text-sm">
          <span className="flex-1">Your plan is for <b>{inputs.guests}</b> guests, and your list expects <b>{expected}</b>. Want the plan to match?</span>
          <Button size="sm" variant="outline"
            onClick={() => preview({ title: `Plan for ${expected} guests`, label: `Planned for ${expected} guests from the guest list`, changes: { guests: expected } })}>
            Plan for {expected} guests
          </Button>
        </div>
      )}

      <Panel
        title="Add a guest" icon={UserPlus}
        actions={
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Lock className="size-3.5" aria-hidden="true" /> Stays in this browser
          </span>
        }
      >
        <form onSubmit={add} noValidate className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1.5fr_0.7fr_1fr_auto] lg:items-end">
          <div className="grid gap-1.5">
            <Label htmlFor="g-name">Name</Label>
            <Input id="g-name" ref={nameField} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} aria-invalid={Boolean(error)} aria-describedby="g-error" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="g-group">Group (optional)</Label>
            <Input id="g-group" list="guest-groups" maxLength={40} value={group} onChange={(e) => setGroup(e.target.value)} placeholder="e.g. Bride's family" />
            <datalist id="guest-groups">{groups.map((g) => <option key={g} value={g} />)}</datalist>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="g-party">Party size</Label>
            <Input id="g-party" type="number" inputMode="numeric" min={1} max={50} value={party} onChange={(e) => setParty(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="g-rsvp">RSVP</Label>
            <Select value={rsvp} onValueChange={(v) => setRsvp(v as Rsvp)}>
              <SelectTrigger id="g-rsvp" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{(Object.keys(RSVP_LABELS) as Rsvp[]).map((r) => <SelectItem key={r} value={r}>{RSVP_LABELS[r]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Button type="submit">Add</Button>
          <div className="sm:col-span-2 lg:col-span-5"><FieldError id="g-error">{error}</FieldError></div>
        </form>
      </Panel>

      <Panel title="Guest list" icon={Users} description={plural(guests.length, "entry", "entries")}>
        {guests.length === 0 ? (
          <EmptyState icon={Users} title="No guests yet">Add families or friends with their party size. Your plan keeps using {inputs.guests} until you choose to update it.</EmptyState>
        ) : (
          <>
            <div className="relative mb-3 max-w-xs">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input aria-label="Search guests" placeholder="Search name or group" className="pl-8" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <div className="scroll-area overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-surface-soft">
                    <TableHead>Name</TableHead>
                    <TableHead>Group</TableHead>
                    <TableHead className="text-right">Party</TableHead>
                    <TableHead>RSVP</TableHead>
                    <TableHead><span className="sr-only">Remove</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shown.map((guest) => (
                    <TableRow key={guest.id}>
                      <TableCell className="font-medium">{guest.name}</TableCell>
                      <TableCell className="text-muted-foreground">{guest.group || "—"}</TableCell>
                      <TableCell className="num text-right">{guest.party}</TableCell>
                      <TableCell>
                        <Select value={guest.rsvp} onValueChange={(v) => update(guest.id, { rsvp: v as Rsvp })}>
                          <SelectTrigger size="sm" className="w-32" aria-label={`RSVP for ${guest.name}`}><SelectValue /></SelectTrigger>
                          <SelectContent>{(Object.keys(RSVP_LABELS) as Rsvp[]).map((r) => <SelectItem key={r} value={r}>{RSVP_LABELS[r]}</SelectItem>)}</SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="icon-sm" variant="ghost" onClick={() => setGuests(guests.filter((g) => g.id !== guest.id))} aria-label={`Remove ${guest.name}`}>
                          <Trash2 aria-hidden="true" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </Panel>
      {dialog}
    </div>
  );
}
