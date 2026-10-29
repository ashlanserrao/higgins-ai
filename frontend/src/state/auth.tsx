// Who is signed in. Each account has its own events: the planner is mounted once per user
// (see main.tsx), so signing in or out loads that account's events from scratch.

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import * as accounts from "@/lib/accounts";

function useAuthState() {
  const [user, setUser] = useState(accounts.currentUser);
  const signIn = useCallback(async (username: string, password: string) => setUser(await accounts.signIn(username, password)), []);
  const createAccount = useCallback(async (username: string, password: string) => setUser(await accounts.createAccount(username, password)), []);
  const signOut = useCallback(() => {
    accounts.endSession();
    setUser(null);
  }, []);
  return useMemo(() => ({ user, signIn, createAccount, signOut }), [user, signIn, createAccount, signOut]);
}

const AuthContext = createContext<ReturnType<typeof useAuthState> | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  return <AuthContext.Provider value={useAuthState()}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("useAuth must be used inside AuthProvider");
  return auth;
}
