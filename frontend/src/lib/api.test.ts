import { describe, expect, it } from "vitest";
import { ApiError, errorMessage } from "./api";

describe("errorMessage", () => {
  it("shows the API's own words, and never a blank for something that isn't an Error", () => {
    expect(errorMessage(new ApiError("Please check the highlighted fields."))).toBe("Please check the highlighted fields.");
    expect(errorMessage(new TypeError("Failed to fetch"))).toBe("Failed to fetch");
    expect(errorMessage("offline")).toBe("offline");
  });
});
