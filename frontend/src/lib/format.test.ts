import { afterEach, describe, expect, it, vi } from "vitest";
import { addDays, daysBetween, greeting, inr, shortInr, signedInr, todayInIndia, untilNextGreeting } from "./format";

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

describe("greeting", () => {
  // Local clock times: the greeting follows the visitor's own clock.
  const at = (hour: number, minute = 0) => new Date(2026, 9, 29, hour, minute);

  it("says morning, afternoon or evening by the hour", () => {
    expect(greeting(at(6))).toBe("Good morning");
    expect(greeting(at(11, 59))).toBe("Good morning");
    expect(greeting(at(12))).toBe("Good afternoon");
    expect(greeting(at(16, 59))).toBe("Good afternoon");
    expect(greeting(at(17))).toBe("Good evening");
    expect(greeting(at(23, 30))).toBe("Good evening");
  });

  it("knows when it next changes", () => {
    expect(untilNextGreeting(at(11, 30))).toBe(30 * 60_000);
    expect(untilNextGreeting(at(16))).toBe(60 * 60_000);
    expect(untilNextGreeting(at(23))).toBe(60 * 60_000); // midnight, a new morning
  });
});
