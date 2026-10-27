import { afterEach, describe, expect, it, vi } from "vitest";
import { addDays, daysBetween, inr, shortInr, signedInr, todayInIndia } from "./format";

afterEach(() => vi.useRealTimers());

describe("money", () => {
  it("groups rupees the Indian way", () => {
    expect(inr(150000)).toBe("₹1,50,000");
    expect(inr(25000000)).toBe("₹2,50,00,000");
    expect(signedInr(-215000)).toBe("−₹2,15,000");
    expect(signedInr(110000)).toBe("+₹1,10,000");
  });

  it("shortens to lakh, crore and thousand", () => {
    expect(shortInr(2500000)).toBe("₹25L");
    expect(shortInr(15000000)).toBe("₹1.5Cr");
    expect(shortInr(150000)).toBe("₹1.5L");
    expect(shortInr(85000)).toBe("₹85K");
    expect(shortInr(500)).toBe("₹500");
  });
});

describe("dates", () => {
  it("turns over to the next day at midnight in India, not UTC", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-27T18:29:59Z")); // 23:59:59 IST
    expect(todayInIndia()).toBe("2026-10-27");
    vi.setSystemTime(new Date("2026-10-27T18:30:00Z")); // 00:00 IST
    expect(todayInIndia()).toBe("2026-10-28");
  });

  it("counts whole days across months and years", () => {
    expect(daysBetween("2026-10-21", "2026-12-12")).toBe(52);
    expect(daysBetween("2026-10-21", "2026-10-20")).toBe(-1);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});
