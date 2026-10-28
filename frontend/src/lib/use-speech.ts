// Voice input through the browser's own speech recognition (the Web Speech API). Chrome, Edge
// and Safari have it; Firefox doesn't, so callers hide the mic when `speechSupported` is false.
// The browser asks for the microphone on the first start(), never before.

import { useCallback, useEffect, useRef, useState } from "react";

/** The language recognition listens for. The app is English-only, written for India. */
export const SPEECH_LANG = "en-IN";

// Not in TypeScript's DOM types: only the parts used here.
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionClass = new () => Recognition;

const scope = (typeof window === "undefined" ? {} : window) as {
  SpeechRecognition?: RecognitionClass; webkitSpeechRecognition?: RecognitionClass;
};
const Speech = scope.SpeechRecognition ?? scope.webkitSpeechRecognition;

export const speechSupported = Boolean(Speech);

/** Why listening ended without words. */
export type SpeechError = "no-speech" | "denied" | "failed";

const reason = (code: string): SpeechError | null =>
  code === "aborted" ? null
    : code === "no-speech" ? "no-speech"
      : code === "not-allowed" || code === "service-not-allowed" ? "denied"
        : "failed";

/** `onHeard` gets the final words once listening stops on its own, by stop() or when the tab is
 *  hidden; abort() drops them. One pause in speech ends listening (no continuous mode). */
export function useSpeech(onHeard: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<SpeechError | null>(null);
  const current = useRef<{ recognition: Recognition; dropped: boolean } | null>(null);
  const heard = useRef(onHeard);
  useEffect(() => {
    heard.current = onHeard;
  });

  const stop = useCallback(() => current.current?.recognition.stop(), []);
  const abort = useCallback(() => {
    if (!current.current) return;
    current.current.dropped = true;
    current.current.recognition.abort();
  }, []);

  const start = useCallback(() => {
    if (!Speech || current.current) return;
    const recognition = new Speech();
    const session = { recognition, dropped: false };
    recognition.lang = SPEECH_LANG;
    recognition.interimResults = true;
    recognition.continuous = false;
    let words = "";
    recognition.onresult = (event) => {
      words = Array.from(event.results, (result) => result[0].transcript).join("");
      setTranscript(words);
    };
    recognition.onerror = (event) => setError(reason(event.error));
    recognition.onend = () => {
      current.current = null;
      setListening(false);
      setTranscript("");
      if (!session.dropped && words.trim()) heard.current(words.trim());
    };
    setError(null);
    setTranscript("");
    try {
      recognition.start();
    } catch {
      setError("failed");
      return;
    }
    current.current = session;
    setListening(true);
  }, []);

  // A hidden tab keeps what was heard; leaving the page drops it.
  useEffect(() => {
    if (!listening) return;
    const onHide = () => document.visibilityState === "hidden" && stop();
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [listening, stop]);
  useEffect(() => abort, [abort]);

  return { listening, transcript, error, clearError: useCallback(() => setError(null), []), start, stop, abort };
}
