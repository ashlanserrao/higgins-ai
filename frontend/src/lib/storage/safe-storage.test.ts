import { afterEach, describe, expect, it, vi } from "vitest";
import { readItem, writeItem } from "./safe-storage";

afterEach(() => vi.unstubAllGlobals());

describe("safe storage", () => {
  it("reads back what it wrote, and null removes it", () => {
    const data = new Map<string, string>();
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => void data.set(key, value),
      removeItem: (key: string) => void data.delete(key),
    });
    writeItem("session", "overview:tab", "soon");
    expect(readItem("session", "overview:tab")).toBe("soon");
    writeItem("session", "overview:tab", null);
    expect(readItem("session", "overview:tab")).toBeNull();
  });

  it("never throws when site data is blocked, even on reaching localStorage", () => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get: () => {
        throw new DOMException("The operation is insecure.", "SecurityError");
      },
    });
    try {
      expect(readItem("local", "sidebar:collapsed")).toBeNull();
      expect(() => writeItem("local", "sidebar:collapsed", "1")).not.toThrow();
    } finally {
      Reflect.deleteProperty(globalThis, "localStorage");
    }
  });
});
