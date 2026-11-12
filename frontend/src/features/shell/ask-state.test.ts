import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/client";
import { whyFailed } from "./ask-state";

describe("whyFailed", () => {
  it("shows a rejected request's field message, with no Retry", () => {
    const rejected = new ApiError("The event date is in the past.", [{ field: "event_date", message: "The event date is in the past." }]);
    expect(whyFailed(rejected)).toEqual({ error: "The event date is in the past.", retry: false });
  });

  it("offers Retry when asking again could work (busy, offline)", () => {
    const busy = new ApiError("The AI helper is busy right now. Please try again in a few minutes.");
    expect(whyFailed(busy)).toEqual({ error: busy.message, retry: true });
  });
});
