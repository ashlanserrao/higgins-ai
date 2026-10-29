// Sign in, or create an account. Shown at #/signin and in place of any page that needs an
// account, so a visitor who typed their event on the landing page lands back on it after.

import { useId, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/field-error";
import { AccountError, DEMO, MIN_PASSWORD } from "@/lib/accounts";
import { useAuth } from "@/state/auth";
import { useNav } from "@/state/nav";

type Mode = "signin" | "create";

const TEXT: Record<Mode, { title: string; body: string; submit: string; switchTo: string; switchLabel: string }> = {
  signin: {
    title: "Welcome back",
    body: "Sign in to see your events.",
    submit: "Sign in",
    switchTo: "New here?",
    switchLabel: "Create an account",
  },
  create: {
    title: "Create your account",
    body: "Pick a username and a password. Your events stay with your account.",
    submit: "Create account",
    switchTo: "Have an account?",
    switchLabel: "Sign in",
  },
};

export function SignIn() {
  const { signIn, createAccount } = useAuth();
  const { page, go, openPage } = useNav();
  const [mode, setMode] = useState<Mode>("signin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<AccountError | null>(null);
  const [busy, setBusy] = useState(false);
  const ids = { username: useId(), password: useId(), error: useId(), hint: useId() };
  const text = TEXT[mode];

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await (mode === "signin" ? signIn : createAccount)(username, password);
      // From the sign-in page itself, into the app; from anywhere else, stay where they were going.
      if (page === "signin") go("overview");
    } catch (caught) {
      setError(caught instanceof AccountError ? caught : new AccountError("Something went wrong. Try again.", "form"));
      setBusy(false);
    }
  };

  const switchMode = () => {
    setMode(mode === "signin" ? "create" : "signin");
    setError(null);
  };

  const fieldError = (field: "username" | "password") => (error?.field === field ? error.message : undefined);

  return (
    <div className="grid min-h-screen place-items-center px-4 py-10">
      <main className="w-full max-w-sm">
        <a
          href="#/welcome"
          onClick={(e) => {
            e.preventDefault();
            openPage("welcome");
          }}
          className="mb-8 inline-flex items-center gap-2.5 rounded-lg"
        >
          <span className="font-display grid size-10 place-items-center rounded-[10px] bg-primary-soft text-xl text-primary-ink" aria-hidden="true">H</span>
          <span className="font-display text-lg">Higgins AI</span>
        </a>

        <div className="rounded-2xl border bg-card p-6 md:p-7">
          <h1 className="text-3xl leading-tight">{text.title}</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">{text.body}</p>

          <form onSubmit={submit} noValidate className="mt-6 grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor={ids.username}>Username</Label>
              <Input
                id={ids.username} value={username} onChange={(e) => setUsername(e.target.value)} autoFocus
                autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={30} required
                aria-invalid={Boolean(fieldError("username"))} aria-describedby={fieldError("username") ? ids.error : undefined}
              />
              {error?.field === "username" && <FieldError id={ids.error}>{error.message}</FieldError>}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={ids.password}>Password</Label>
              <Input
                id={ids.password} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                aria-invalid={Boolean(fieldError("password"))}
                aria-describedby={fieldError("password") ? ids.error : mode === "create" ? ids.hint : undefined}
              />
              {error?.field === "password" ? (
                <FieldError id={ids.error}>{error.message}</FieldError>
              ) : (
                mode === "create" && <p id={ids.hint} className="text-xs text-muted-foreground">At least {MIN_PASSWORD} characters.</p>
              )}
            </div>
            {/* Said aloud as it appears; the fields stay as typed so a slip is quick to fix. */}
            <div role="alert">{error?.field === "form" && <FieldError>{error.message}</FieldError>}</div>
            <Button type="submit" disabled={busy || !username.trim() || !password} aria-busy={busy} className="rounded-full">
              {busy && <Loader2 className="animate-spin" aria-hidden="true" />} {text.submit}
            </Button>
          </form>

          <p className="mt-5 text-sm text-muted-foreground">
            {text.switchTo}{" "}
            <button type="button" onClick={switchMode} className="font-medium text-primary-text underline-offset-4 hover:underline pointer-coarse:min-h-11">
              {text.switchLabel}
            </button>
          </p>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-soft px-4 py-3 text-sm">
          <span>Just looking? Use <span className="font-medium">{DEMO.username}</span> / <span className="font-medium">{DEMO.password}</span></span>
          <Button
            type="button" variant="outline" size="sm" className="rounded-full"
            onClick={() => {
              setMode("signin");
              setUsername(DEMO.username);
              setPassword(DEMO.password);
              setError(null);
            }}
          >
            Fill it in
          </Button>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">Accounts and events are kept in this browser only. Our server doesn't keep a copy.</p>
      </main>
    </div>
  );
}
