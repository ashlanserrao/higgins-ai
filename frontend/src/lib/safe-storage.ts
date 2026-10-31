// Small per-browser preferences (the open tab, the folded sidebar, the theme). Storage can be
// blocked (private mode, site data off), so a read gives null and a write is dropped instead of
// throwing: the app works the same, it just doesn't remember. Event data has lib/storage.ts.

type Area = "local" | "session";

// Looked up on each call: even reaching `localStorage` throws when site data is blocked.
const area = (name: Area) => (name === "local" ? localStorage : sessionStorage);

export function readItem(name: Area, key: string): string | null {
  try {
    return area(name).getItem(key);
  } catch {
    return null;
  }
}

/** `null` removes the key. */
export function writeItem(name: Area, key: string, value: string | null) {
  try {
    if (value === null) area(name).removeItem(key);
    else area(name).setItem(key, value);
  } catch {
    // Not remembered; it lasts as long as the page.
  }
}
