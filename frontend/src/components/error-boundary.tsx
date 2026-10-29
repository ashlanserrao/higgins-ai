// The last line of defence: if any part of the page throws while rendering, show a calm
// message and a reload instead of a blank screen. Plans live in this browser, so they're safe.

import { Component, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="grid min-h-screen place-items-center p-4 text-center">
        <div className="space-y-3">
          <p role="alert" className="font-medium">Something went wrong on this page. Your plans are safe in this browser.</p>
          <Button onClick={() => location.reload()}>Reload</Button>
        </div>
      </div>
    );
  }
}
