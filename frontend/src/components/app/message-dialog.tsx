// Ready-to-send vendor messages, filled from the plan by the engine (no AI).
// The budget is left out unless the organiser opts in: it weakens negotiation.

import { useEffect, useState } from "react";
import { Check, Copy, Loader2, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { FieldError } from "@/components/field-error";
import { api } from "@/lib/api";
import { canMessage, defaultMessageKind, MESSAGE_KINDS } from "@/lib/tasks";
import type { MessageKind } from "@/lib/types";
import { useReturnFocus } from "@/lib/use-return-focus";
import { usePlan } from "@/state/planner";

export function MessageDialog({ taskId, open, onOpenChange }: {
  taskId: string | null; open: boolean; onOpenChange: (open: boolean) => void;
}) {
  const { inputs, plan, announce } = usePlan();
  const tasks = plan.checklist.filter((item) => canMessage(item.id));
  const [task, setTask] = useState(taskId ?? tasks[0]?.id ?? "");
  const [kind, setKind] = useState<MessageKind>("enquiry");
  const [includeBudget, setIncludeBudget] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  // Opened from a task's menu, its opener is gone on close: the menu's button gets focus back.
  const returnFocus = useReturnFocus(open);

  // Opening for a task picks the message that fits its state (booked → confirmation…).
  // biome-ignore lint/correctness/useExhaustiveDependencies: once per opening; later plan changes must not switch the message being written.
  useEffect(() => {
    if (!open) return;
    const id = taskId ?? tasks[0]?.id ?? "";
    const item = plan.checklist.find((i) => i.id === id);
    setTask(id);
    if (item) setKind(defaultMessageKind(item));
  }, [open, taskId]);

  useEffect(() => {
    if (!open || !task) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    setCopied(false);
    api.message(inputs, task, kind, includeBudget)
      .then((r) => !cancelled && setText(r.text))
      .catch((e) => {
        if (cancelled) return;
        setText("");
        setError((e as Error).message);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [open, task, kind, includeBudget, inputs]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      announce("Copied. Paste it into WhatsApp or email.");
    } catch {
      announce("Select the text and copy it.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] scroll-area overflow-y-auto sm:max-w-xl" onCloseAutoFocus={(e) => { e.preventDefault(); returnFocus(); }}>
        <DialogHeader>
          <DialogTitle>Message a vendor</DialogTitle>
          <DialogDescription>Written from your plan, ready to send. Copy it, or send it straight from WhatsApp.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="grid gap-1.5">
            <Label htmlFor="msg-task">Booking</Label>
            <Select value={task} onValueChange={setTask}>
              <SelectTrigger id="msg-task" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {tasks.map((item) => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="msg-kind">Message</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as MessageKind)}>
              <SelectTrigger id="msg-kind" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MESSAGE_KINDS.map((k) => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{MESSAGE_KINDS.find((k) => k.value === kind)?.hint}</p>
        <div className="flex items-center gap-2">
          <Switch id="msg-budget" checked={includeBudget} onCheckedChange={setIncludeBudget} />
          <Label htmlFor="msg-budget" className="font-normal">Mention my budget for this <span className="text-muted-foreground">(usually better left out when asking for quotes)</span></Label>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="msg-text">Message text</Label>
          <Textarea id="msg-text" readOnly value={text} rows={12} aria-busy={loading} className="font-mono text-xs leading-relaxed" />
          {loading && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> Writing it for you…
            </p>
          )}
          <FieldError>{error}</FieldError>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={copy} disabled={!text}>
            {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />} {copied ? "Copied" : "Copy"}
          </Button>
          <Button asChild className={!text ? "pointer-events-none opacity-50" : ""}>
            <a href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer" aria-disabled={!text}>
              <MessageCircle aria-hidden="true" /> Send on WhatsApp
            </a>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
