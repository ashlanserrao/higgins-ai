// A text box with a mic in its corner: speak, and the words join what's already typed, ready to
// edit. Nothing is sent by itself. Where the browser has no speech recognition (Firefox) or the
// box is disabled, it's a plain text box.

import { type ComponentProps } from "react";
import { Mic } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { addSpoken, speechSupported, useSpeech } from "@/lib/use-speech";
import { cn } from "@/lib/utils";

type Props = Omit<ComponentProps<typeof Textarea>, "value" | "onChange" | "id"> & {
  id: string;
  value: string;
  onValueChange: (text: string) => void;
  /** Read by screen readers on the mic: "Speak the must-haves". */
  speakLabel?: string;
};

export function VoiceTextarea({ id, value, onValueChange, speakLabel = "Speak instead of typing", maxLength, disabled, className, onKeyDown, placeholder, ...props }: Props) {
  const speech = useSpeech((words) => {
    onValueChange(addSpoken(value, words, maxLength));
    window.requestAnimationFrame(() => document.getElementById(id)?.focus());
  });
  const mic = speechSupported && !disabled;

  return (
    <div>
      <div className="relative">
        <Textarea
          id={id} maxLength={maxLength} disabled={disabled} {...props}
          // While listening the words appear as they're heard, and the box waits.
          value={speech.listening && speech.transcript ? addSpoken(value, speech.transcript, maxLength) : value}
          readOnly={speech.listening}
          placeholder={speech.listening ? "Listening…" : placeholder}
          onChange={(e) => {
            onValueChange(e.target.value);
            speech.clearError();
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape" && speech.listening) {
              e.preventDefault();
              speech.stop();
              return;
            }
            onKeyDown?.(e);
          }}
          // It grows with its text, so the mic can have the resize grip's corner.
          className={cn(mic && "resize-none pr-12 max-md:pr-14", className)}
        />
        {mic && (
          <button
            type="button" onClick={() => (speech.listening ? speech.stop() : speech.start())}
            aria-pressed={speech.listening} aria-label={speakLabel} title={speech.listening ? "Stop listening (Esc)" : speakLabel}
            className={cn(
              "absolute right-1.5 bottom-1.5 grid size-9 place-items-center rounded-full outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 max-md:size-11",
              speech.listening
                ? "bg-primary text-primary-foreground motion-safe:animate-[ask-listen_1.4s_ease-out_infinite]"
                : "text-muted-foreground hover:bg-surface-soft hover:text-foreground",
            )}
          >
            <Mic className="size-[18px]" aria-hidden="true" />
          </button>
        )}
      </div>
      {/* A voice problem for two seconds, or the first-use note while listening. Empty, it takes
          no room, but stays in place so screen readers hear it when it's filled. */}
      {mic && <p aria-live="polite" className="mt-1 text-xs text-muted-foreground empty:mt-0">{speech.message}</p>}
    </div>
  );
}
