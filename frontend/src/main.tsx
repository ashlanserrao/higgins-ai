import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { initTheme } from "./lib/theme";
import { AuthProvider, useAuth } from "./state/auth";
import { NavProvider } from "./state/nav";
import { PlannerProvider } from "./state/planner";
import "./index.css";

initTheme();

/** A fresh planner per account. Navigation sits above it, so what a visitor typed on the
 *  landing page survives signing in. */
function AccountPlanner({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return <PlannerProvider key={user ?? ""} owner={user}>{children}</PlannerProvider>;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <NavProvider>
        <AccountPlanner>
          <App />
        </AccountPlanner>
      </NavProvider>
    </AuthProvider>
  </StrictMode>,
);
