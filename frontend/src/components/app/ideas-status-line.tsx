import { RefreshCw } from "lucide-react";
import { AiNote } from "@/components/badges";
import { Button } from "@/components/ui/button";
import { usePlan } from "@/state/planner";

/** Ideas made before the latest changes, or a failed fetch, with a way to try again. */
export function IdeasStatusLine() {
  const { ideasStatus, loadIdeas } = usePlan();
  if (ideasStatus === "stale")
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-lg bg-ai-tint/60 px-4 py-2.5 text-sm">
        <span className="flex-1">These ideas were made before your latest changes.</span>
        <Button size="sm" variant="ai" onClick={loadIdeas}><RefreshCw aria-hidden="true" /> Refresh ideas</Button>
      </div>
    );
  if (ideasStatus === "failed")
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-lg bg-danger-soft px-4 py-2.5 text-sm">
        <span className="flex-1">The ideas didn't come through this time. Your plan is fine.</span>
        <Button size="sm" variant="outline" onClick={loadIdeas}><RefreshCw aria-hidden="true" /> Try again</Button>
      </div>
    );
  return null;
}

/** Who the ideas are from: the AI, or, on someone's shared link, whoever made the link. */
export function IdeasNote({ short = false }: { short?: boolean }) {
  const { shared } = usePlan();
  if (shared) return <AiNote>From the shared link, not from Higgins. Check them before using.</AiNote>;
  return <AiNote>{short ? "Suggested by AI. Give it a quick check." : undefined}</AiNote>;
}
