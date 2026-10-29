// Accounts for the demo, kept in this browser like everything else: there is no server-side
// login (see plans/project_spec.md, out of scope). Passwords are never stored as typed, only
// as a salted PBKDF2 hash. An account exists only in the browser it was made in. The demo
// account (test / test) is created on first use.

const ACCOUNTS_KEY = "higgins:accounts";
const SESSION_KEY = "higgins:session";
const ITERATIONS = 100_000;

export const DEMO = { username: "test", password: "test" };
/** Letters, numbers, dot, dash and underscore, 3 to 30 of them. */
export const USERNAME = /^[A-Za-z0-9._-]{3,30}$/;
export const MIN_PASSWORD = 4;

interface Account {
  name: string; // as typed at sign-up; the key is its lower-case form
  salt: string;
  hash: string;
}
type Accounts = Record<string, Account>;

/** A message for the person, and the field it belongs to. */
export class AccountError extends Error {
  constructor(message: string, readonly field: "username" | "password" | "form") {
    super(message);
  }
}

const NO_STORAGE = "This browser isn't letting us save anything (private mode or blocked site data), so accounts can't work here.";

const base64 = (bytes: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(bytes)));

async function hashPassword(password: string, salt: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const salted = Uint8Array.from(atob(salt), (c) => c.charCodeAt(0));
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salted, iterations: ITERATIONS }, key, 256);
  return base64(bits);
}

async function makeAccount(name: string, password: string): Promise<Account> {
  const salt = base64(crypto.getRandomValues(new Uint8Array(16)));
  return { name, salt, hash: await hashPassword(password, salt) };
}

function readAccounts(): Accounts {
  try {
    return JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeAccounts(accounts: Accounts) {
  try {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
  } catch {
    throw new AccountError(NO_STORAGE, "form");
  }
}

/** Every account, with the demo one added the first time it's needed. */
async function accountsWithDemo() {
  const accounts = readAccounts();
  if (!accounts[DEMO.username]) {
    accounts[DEMO.username] = await makeAccount(DEMO.username, DEMO.password);
    writeAccounts(accounts);
  }
  return accounts;
}

function startSession(name: string) {
  try {
    localStorage.setItem(SESSION_KEY, name);
  } catch {
    throw new AccountError(NO_STORAGE, "form");
  }
  return name;
}

/** The signed-in username, or null. */
export function currentUser(): string | null {
  try {
    const name = localStorage.getItem(SESSION_KEY);
    return name && readAccounts()[name.toLowerCase()] ? name : null;
  } catch {
    return null;
  }
}

export function endSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // Nothing was saved, so nothing to clear.
  }
}

/** Resolves to the username as it should be shown. */
export async function signIn(username: string, password: string) {
  const accounts = await accountsWithDemo();
  const account = accounts[username.trim().toLowerCase()];
  // The same message either way, so it doesn't reveal which usernames exist.
  if (!account || (await hashPassword(password, account.salt)) !== account.hash) {
    throw new AccountError("That username and password don't match.", "form");
  }
  return startSession(account.name);
}

export async function createAccount(username: string, password: string) {
  const name = username.trim();
  if (!USERNAME.test(name)) {
    throw new AccountError("Use 3 to 30 letters, numbers, dots, dashes or underscores.", "username");
  }
  if (password.length < MIN_PASSWORD) {
    throw new AccountError(`Use at least ${MIN_PASSWORD} characters.`, "password");
  }
  const accounts = await accountsWithDemo();
  if (accounts[name.toLowerCase()]) throw new AccountError("That username is taken. Try another, or sign in.", "username");
  accounts[name.toLowerCase()] = await makeAccount(name, password);
  writeAccounts(accounts);
  return startSession(name);
}
