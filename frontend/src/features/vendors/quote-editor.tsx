// Review or type in a quote. An AI draft is shown as AI-read and can't be accepted until the
// organiser ticks that they've checked it against the vendor's own quote.

import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AiBadge, AiNote, FieldError } from "@/components/common";
import type { Quote } from "@/lib/types";
import { usePlan } from "@/state/planner";

export const newQuoteId = () => `q${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const blankQuote = (category = ""): Quote => ({
  id: newQuoteId(), category, vendor: "", total_inr: null, per_plate_inr: null, guests_covered: null,
  inclusions: [], exclusions: [], taxes_included: null, valid_until: null, source: "manual", verified: false, accepted_on: null,
});

const toText = (n: number | null) => (n === null ? "" : String(n));
const toNumber = (s: string) => (s.trim() === "" ? null : Number(s));
const toLines = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean);

export function QuoteEditor({ quote, onClose }: { quote: Quote | null; onClose: () => void }) {
  const { plan, inputs, updateProgress } = usePlan();
  const [form, setForm] = useState({
    category: "", vendor: "", total: "", perPlate: "", guests: "", taxes: "unknown", validUntil: "",
    inclusions: "", exclusions: "", verified: false,
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!quote) return;
    setError("");
    setForm({
      category: quote.category, vendor: quote.vendor, total: toText(quote.total_inr), perPlate: toText(quote.per_plate_inr),
      guests: toText(quote.guests_covered), taxes: quote.taxes_included === null ? "unknown" : quote.taxes_included ? "yes" : "no",
      validUntil: quote.valid_until ?? "", inclusions: quote.inclusions.join("\n"), exclusions: quote.exclusions.join("\n"),
      verified: quote.verified,
    });
  }, [quote]);

  if (!quote) return null;
  const isNew = !inputs.progress.quotes.some((q) => q.id === quote.id);
  const fromAi = quote.source === "ai_extracted";
  const set = (key: keyof typeof form, value: string | boolean) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const notes = [...toLines(form.inclusions), ...toLines(form.exclusions)];
    if (!form.category) return setError("Pick which budget line this quote is for.");
    if (notes.some((n) => n.length > 80)) return setError("Keep each included or excluded item under 80 characters.");
    if (toLines(form.inclusions).length > 12 || toLines(form.exclusions).length > 12) return setError("List up to 12 items each.");
    const saved: Quote = {
      ...quote,
      category: form.category,
      vendor: form.vendor.trim(),
      total_inr: toNumber(form.total),
      per_plate_inr: toNumber(form.perPlate),
      guests_covered: toNumber(form.guests),
      taxes_included: form.taxes === "unknown" ? null : form.taxes === "yes",
      valid_until: form.validUntil || null,
      inclusions: toLines(form.inclusions),
      exclusions: toLines(form.exclusions),
      verified: form.verified,
      // An accepted quote must stay checked and priced; otherwise it goes back to "not accepted".
      accepted_on: form.verified && (form.total || form.perPlate) && form.category === quote.category ? quote.accepted_on : null,
    };
    setBusy(true);
    setError("");
    try {
      await updateProgress((progress) => {
        progress.quotes = isNew ? [...progress.quotes, saved] : progress.quotes.map((q) => (q.id === saved.id ? saved : q));
        return progress;
      }, `${isNew ? "Added" : "Updated"} the quote${saved.vendor ? ` from ${saved.vendor}` : ""}`);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2">
              {fromAi ? "Check what the AI read" : isNew ? "Add a quote" : "Edit the quote"}
              {fromAi && <AiBadge>Read by AI</AiBadge>}
            </DialogTitle>
            <DialogDescription>
              {fromAi
                ? "Compare each field with the vendor's message. Blank means the quote didn't say, so nothing has been guessed."
                : "Fill in what the vendor told you. Leave anything they didn't mention blank."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="q-category">Budget line</Label>
              <Select value={form.category} onValueChange={(v) => set("category", v)}>
                <SelectTrigger id="q-category" className="w-full"><SelectValue placeholder="Which line is it for?" /></SelectTrigger>
                <SelectContent>
                  {plan.budget_lines.filter((l) => l.key !== "contingency").map((l) => <SelectItem key={l.key} value={l.key}>{l.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="q-vendor">Vendor name</Label>
              <Input id="q-vendor" maxLength={80} value={form.vendor} onChange={(e) => set("vendor", e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="q-total">Total price (₹)</Label>
              <Input id="q-total" type="number" inputMode="numeric" min={0} className="num" value={form.total} onChange={(e) => set("total", e.target.value)} placeholder="Not stated" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="q-plate">Per plate / per person (₹)</Label>
              <Input id="q-plate" type="number" inputMode="numeric" min={0} className="num" value={form.perPlate} onChange={(e) => set("perPlate", e.target.value)} placeholder="Not stated" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="q-guests">Guests covered</Label>
              <Input id="q-guests" type="number" inputMode="numeric" min={1} className="num" value={form.guests} onChange={(e) => set("guests", e.target.value)} placeholder="Not stated" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="q-taxes">Taxes (GST)</Label>
              <Select value={form.taxes} onValueChange={(v) => set("taxes", v)}>
                <SelectTrigger id="q-taxes" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unknown">Not stated</SelectItem>
                  <SelectItem value="yes">Included</SelectItem>
                  <SelectItem value="no">Extra</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="q-valid">Valid until</Label>
              <Input id="q-valid" type="date" value={form.validUntil} onChange={(e) => set("validUntil", e.target.value)} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="q-in">Included (one per line)</Label>
              <Textarea id="q-in" rows={4} value={form.inclusions} onChange={(e) => set("inclusions", e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="q-out">Not included (one per line)</Label>
              <Textarea id="q-out" rows={4} value={form.exclusions} onChange={(e) => set("exclusions", e.target.value)} />
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-lg bg-surface-soft p-4">
            <Checkbox id="q-verified" checked={form.verified} onCheckedChange={(c) => set("verified", c === true)} className="mt-0.5" />
            <div>
              <Label htmlFor="q-verified">I've checked these against the vendor's quote</Label>
              <p className="mt-0.5 text-xs text-muted-foreground">Only checked quotes can be accepted and counted as Confirmed. It takes a minute.</p>
            </div>
          </div>
          {fromAi && <AiNote>Read by AI from your pasted text. Give it a quick check before accepting.</AiNote>}
          <FieldError>{error}</FieldError>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={busy}>{isNew ? "Save quote" : "Save changes"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
