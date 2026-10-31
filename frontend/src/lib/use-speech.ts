// Voice input through the browser's own speech recognition (the Web Speech API). Chrome, Edge
// and Safari have it; Firefox doesn't, so callers hide the mic when `speechSupported` is false.
// The browser asks for the microphone on the first start(), never before.

import { useCallback, useEffect, useRef, useState } from "react";
import { readItem, writeItem } from "./safe-storage";

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

/** What's said goes after what's typed, never in place of it, cut to the field's limit. */
export const addSpoken = (before: string, words: string, max = Infinity) =>
  (before.trim() ? `${before.trim()} ${words}` : words).slice(0, max);

/** Why listening ended without words. */
type SpeechError = "no-speech" | "denied" | "failed";

const reason = (code: string): SpeechError | null =>
  code === "aborted" ? null
    : code === "no-speech" ? "no-speech"
      : code === "not-allowed" || code === "service-not-allowed" ? "denied"
        : "failed";

// Calm, and always pointing back to the keyboard.
const ERRORS: Record<SpeechError, string> = {
  "no-speech": "I couldn't hear anything. Try again, or type it.",
  denied: "Microphone access is off. You can type instead.",
  failed: "Voice isn't working right now. You can type instead.",
};
// A problem is said once, briefly: the field is right there to type in.
const ERROR_MS = 2000;
// Said while listening the first time this browser uses voice, here or anywhere in the app.
const FIRST_USE = "Voice is processed by your browser's speech service.";
const NOTED_KEY = "voice:noted";

/** True the first time only. Storage can be blocked: then it's said every visit. */
function firstUse() {
  if (readItem("local", NOTED_KEY)) return false;
  writeItem("local", NOTED_KEY, "1");
  return true;
}

/** `onHeard` gets the final words once listening stops on its own, by stop() or when the tab is
 *  hidden; abort() drops them. One pause in speech ends listening (no continuous mode).
 *  `message` is what to show beside the mic: a problem for two seconds, or the first-use note. */
export function useSpeech(onHeard: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<SpeechError | null>(null);
  const [noting, setNoting] = useState(false);
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
  const clearError = useCallback(() => setError(null), []);

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
    setNoting(firstUse());
  }, []);

  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(clearError, ERROR_MS);
    return () => window.clearTimeout(timer);
  }, [error, clearError]);

  // A hidden tab keeps what was heard; leaving the page drops it.
  useEffect(() => {
    if (!listening) return;
    const onHide = () => document.visibilityState === "hidden" && stop();
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [listening, stop]);
  useEffect(() => abort, [abort]);

  const message = error ? ERRORS[error] : noting && listening ? FIRST_USE : null;
  return { listening, transcript, message, clearError, start, stop, abort };
}
