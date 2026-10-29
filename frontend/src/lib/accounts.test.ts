import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAccount, currentUser, DEMO, signIn } from "./accounts";

beforeEach(() => {
  const data = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("accounts", () => {
  it("signs in to the demo account and remembers who is signed in", async () => {
    expect(currentUser()).toBeNull();
    await expect(signIn(DEMO.username, DEMO.password)).resolves.toBe(DEMO.username);
    expect(currentUser()).toBe(DEMO.username);
  });

  it("gives the same message for a wrong password and an unknown username", async () => {
    const wrongPassword = await signIn(DEMO.username, "nope").catch((e: Error) => e.message);
    const unknownUser = await signIn("nobody", DEMO.password).catch((e: Error) => e.message);
    expect(wrongPassword).toBe("That username and password don't match.");
    expect(unknownUser).toBe(wrongPassword);
    expect(currentUser()).toBeNull();
  });

  it("keeps usernames unique whatever their case, and signs in as typed at sign-up", async () => {
    await createAccount("Asha", "secret");
    await expect(createAccount("asha", "other")).rejects.toThrow("That username is taken.");
    await expect(signIn("ASHA", "secret")).resolves.toBe("Asha");
  });
});
