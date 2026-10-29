import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { AiNote } from "@/components/badges";
import { VoiceTextarea } from "@/components/voice-textarea";
import { api } from "@/lib/api";
import type { UnderstandResponse } from "@/lib/types";

/** Plain language → form values. The AI reads; the organiser checks the form and submits. */
export function DescribeBox({ initialText, active, onFilled, onTyping }: {
  initialText: string; active: boolean; onFilled: (result: UnderstandResponse) => void; onTyping: (typing: boolean) => void;
}) {
  // There's no plan yet, so AI availability comes from this call's own response.
  const [text, setText] = useState(initialText);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const empty = !text.trim();
  const autoRan = useRef(false);

  const read = async () => {
    if (empty) {
      setNote("Write a line about your event first.");
      document.getElementById("describe")?.focus();
      return;
    }
    setBusy(true);
    setNote("");
    try {
      const result = await api.understand(text, null);
      if (!result.ai_available) {
        onTyping(false);
        setNote("That needs the AI, which isn't set up here. The steps below work just as well.");
      } else if (!result.understood) setNote(result.unclear[0] || "I couldn't find event details in that. Try naming the occasion, guests, city, date and budget.");
      else {
        onTyping(false);
        onFilled(result);
      }
    } catch (error) {
      setNote((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void read();
  };

  // Text from the landing page is read straight away, so the form arrives filled in.
  useEffect(() => {
    if (!initialText.trim() || autoRan.current) return;
    autoRan.current = true;
    void read();
  });

  // Enter sends, Shift+Enter starts a new line.
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  };

  return (
    <form onSubmit={submit} className="rounded-xl border border-ai-border bg-ai-soft p-5 md:p-7">
      <Label htmlFor="describe" className="mb-2 font-display text-lg font-normal">Tell me about it in your own words</Label>
      <VoiceTextarea
        id="describe" value={text} maxLength={500} rows={3} onKeyDown={onKeyDown} speakLabel="Say it instead of typing"
        onValueChange={(next) => {
          setText(next);
          onTyping(Boolean(next.trim()));
        }}
        placeholder="e.g. Wedding for 300 in Jaipur on 14 Feb 2027, about 25 lakh, the venue does food"
        className="bg-card" aria-describedby="describe-note"
      />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <AiNote>AI fills in the steps below. You check them before planning.</AiNote>
        {/* Focusable even when empty, so it can say why it isn't ready. */}
        <Button
          type="submit" size="lg" variant={empty ? "outline" : active ? "aiSolid" : "ai"} disabled={busy}
          aria-disabled={empty || undefined} aria-describedby={empty ? "describe-reason" : undefined}
          className="w-full aria-disabled:cursor-not-allowed aria-disabled:border-dashed aria-disabled:bg-surface-soft aria-disabled:text-muted-foreground aria-disabled:shadow-none sm:w-auto"
        >
          {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Sparkles aria-hidden="true" />}
          {busy ? "Reading…" : "Fill the form for me"}
        </Button>
        {empty && <span id="describe-reason" className="sr-only">Write a line about your event first.</span>}
      </div>
      <p id="describe-note" aria-live="polite" className="mt-2 text-sm text-muted-foreground">
        {note}
      </p>
    </form>
  );
}
