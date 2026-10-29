import { expect, it } from "vitest";
import { addSpoken } from "./use-speech";

it("addSpoken adds after what's typed, never in place of it, within the field's limit", () => {
  expect(addSpoken("", "live dhol")).toBe("live dhol");
  expect(addSpoken("Jain food,  ", "live dhol")).toBe("Jain food, live dhol");
  expect(addSpoken("Jain food", "live dhol for the baraat", 20)).toBe("Jain food live dhol ");
});
