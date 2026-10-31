// The plain-language box's answer, filled into the form one value at a time: each on its own
// step, briefly highlighted, then the form lands on the step where checking is needed.

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { FIELD_STEP, type Values } from "./form";

const STEP_MS = 350;

/** The values to end with, the keys still to fill (in order) and the step to land on. */
export type Filling = { values: Values; keys: (keyof Values)[]; step: number };

/** `flash` is the field just filled, for its highlight. */
export function useFillAnimation(setValues: Dispatch<SetStateAction<Values>>, setStep: (step: number) => void) {
  const [filling, setFilling] = useState<Filling | null>(null);
  const [flash, setFlash] = useState<keyof Values | null>(null);

  useEffect(() => {
    if (!filling) return;
    const timer = window.setTimeout(() => {
      const [key, ...rest] = filling.keys;
      if (!key) {
        setValues(filling.values);
        setStep(filling.step);
        setFlash(null);
        setFilling(null);
        return;
      }
      setStep(FIELD_STEP[key]);
      setValues((v) => ({ ...v, [key]: filling.values[key] }));
      setFlash(key);
      setFilling({ ...filling, keys: rest });
    }, STEP_MS);
    return () => window.clearTimeout(timer);
  }, [filling, setValues, setStep]);

  /** Starts on the first key's step; `keys` must not be empty. */
  const start = (next: Filling) => {
    setStep(FIELD_STEP[next.keys[0]]);
    setFilling(next);
  };

  return { flash, start };
}
