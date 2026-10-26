import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { initTheme } from "./lib/theme";
import { NavProvider } from "./state/nav";
import { PlannerProvider } from "./state/planner";
import "./index.css";

initTheme();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PlannerProvider>
      <NavProvider>
        <App />
      </NavProvider>
    </PlannerProvider>
  </StrictMode>,
);
