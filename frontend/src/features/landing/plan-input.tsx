// The "tell me about your event" box: the landing page's way in, used by the hero and the
// closing section. What's typed (or said) goes to the new-event page, which reads it and fills
// the form.

import { useRef, type FormEvent, type KeyboardEvent } from "react";
import { Mic, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { speechSupported, useSpeech } from "@/lib/use-speech";
import { cn } from "@/lib/utils";
import { COPY } from "./copy";

const join = (before: string, words: string) => (before.trim() ? `${before.trim()} ${words}` : words);

export function PlanInput({ id, value, onChange, onSubmit }: {
  id: string;
  value: string;
  onChange: (text: string) => void;
  onSubmit: () => void;
}) {
  const field = useRef<HTMLTextAreaElement>(null);
  // What's said joins what's typed, ready to edit; it's never sent by itself.
  const speech = useSpeech((words) => {
    onChange(join(value, words));
    window.requestAnimationFrame(() => field.current?.focus());
  });

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
    <form
      onSubmit={submit}
      onKeyDown={(e) => e.key === "Escape" && speech.listening && speech.stop()}
      className="rounded-[18px] border border-hairline bg-surface p-4 text-left md:p-5"
    >
      <label htmlFor={id} className="sr-only">{COPY.hero.label}</label>
      <Textarea
        ref={field} id={id} rows={3} maxLength={500} onKeyDown={onKeyDown}
        // While listening the words appear as they're heard.
        value={speech.listening && speech.transcript ? join(value, speech.transcript) : value} readOnly={speech.listening}
        onChange={(e) => {
          onChange(e.target.value);
          speech.clearError();
        }}
        placeholder={speech.listening ? "Listening…" : COPY.hero.placeholder} className="min-h-24 resize-none text-base"
      />
      <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        {/* Voice problems and the first-use note take the helper's place, so nothing moves. */}
        <span aria-live="polite" className="flex items-center gap-1.5 text-sm text-muted-foreground">
          {speech.message ?? <><Sparkles className="size-4 text-ai" aria-hidden="true" /> {COPY.hero.helper}</>}
        </span>
        <div className="flex items-center gap-2">
          {speechSupported && (
            <button
              type="button" onClick={() => (speech.listening ? speech.stop() : speech.start())}
              aria-pressed={speech.listening} aria-label="Speak instead of typing" title="Speak instead of typing"
              className={cn(
                "grid size-11 shrink-0 place-items-center rounded-full border transition-colors",
                speech.listening
                  ? "border-transparent bg-primary text-primary-foreground motion-safe:animate-[ask-listen_1.4s_ease-out_infinite]"
                  : "border-input bg-surface text-muted-foreground hover:bg-surface-soft hover:text-foreground",
              )}
            >
              <Mic className="size-[18px]" aria-hidden="true" />
            </button>
          )}
          <Button type="submit" disabled={speech.listening} className="flex-1 rounded-full px-6 text-base md:flex-none">{COPY.hero.submit}</Button>
        </div>
      </div>
    </form>
  );
}
