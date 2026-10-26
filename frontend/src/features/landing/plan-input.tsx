// The "tell me about your event" box: the landing page's way in, used by the hero and the
// closing section. What's typed goes to the new-event page, which reads it and fills the form.

import type { FormEvent, KeyboardEvent } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { COPY } from "./copy";

export function PlanInput({ id, value, onChange, onSubmit }: {
  id: string;
  value: string;
  onChange: (text: string) => void;
  onSubmit: () => void;
}) {
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };

  // Enter plans, Shift+Enter starts a new line.
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  };

  return (
    <form onSubmit={submit} className="rounded-[18px] border border-hairline bg-surface p-4 text-left shadow-card md:p-5">
      <label htmlFor={id} className="sr-only">{COPY.hero.label}</label>
      <Textarea
        id={id} rows={3} maxLength={500} value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={onKeyDown}
        placeholder={COPY.hero.placeholder} className="min-h-24 resize-none text-base"
      />
      <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Sparkles className="size-4 text-ai" aria-hidden="true" /> {COPY.hero.helper}
        </span>
        <Button type="submit" size="lg" className="w-full rounded-full md:w-auto">{COPY.hero.submit}</Button>
      </div>
    </form>
  );
}
