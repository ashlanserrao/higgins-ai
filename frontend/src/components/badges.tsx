// Status badges and AI labels shared by every section. Status is never colour alone:
// each badge pairs an icon with a word.

import type { ReactNode } from "react";
import { AlertTriangle, BadgeCheck, Calculator, CheckCircle2, CircleDashed, Clock, Sparkles, type LucideIcon } from "lucide-react";
import type { TaskTone } from "@/lib/tasks";
import { cn } from "@/lib/utils";

const TONES: Record<TaskTone | "ai", { box: string; icon: LucideIcon }> = {
  success: { box: "bg-success-soft text-success", icon: CheckCircle2 },
  warning: { box: "bg-warning-soft text-warning", icon: Clock },
  danger: { box: "bg-danger-soft text-danger", icon: AlertTriangle },
  neutral: { box: "bg-surface-soft text-muted-foreground", icon: CircleDashed },
  ai: { box: "bg-ai-tint text-ai", icon: Sparkles },
};

export function StatusBadge({ tone, children, icon, className }: {
  tone: TaskTone | "ai"; children: ReactNode; icon?: LucideIcon; className?: string;
}) {
  const { box, icon: Default } = TONES[tone];
  const Icon = icon ?? Default;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap", box, className)}>
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      {children}
    </span>
  );
}

/** Marks anything the AI wrote or read. AI output always needs a human check. */
export const AiBadge = ({ children = "AI" }: { children?: ReactNode }) => (
  <StatusBadge tone="ai">{children}</StatusBadge>
);

/** Estimate (typical cost) vs Confirmed (an accepted quote). */
export function SourceBadge({ source }: { source: "estimate" | "confirmed" }) {
  return source === "confirmed" ? (
    <StatusBadge tone="success" icon={BadgeCheck}>Confirmed</StatusBadge>
  ) : (
    <StatusBadge tone="neutral">Estimate</StatusBadge>
  );
}

/** The deterministic side: numbers and dates worked out by the rules, not guessed by AI. */
export const EngineBadge = () => (
  <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-soft px-2.5 py-1 text-xs font-medium text-muted-foreground">
    <Calculator className="size-3.5" aria-hidden="true" /> Worked out for you, no maths needed
  </span>
);

export const AiNote = ({ children = "Suggested by AI. Give it a quick check before using it." }: { children?: ReactNode }) => (
  <p className="flex items-center gap-1.5 text-xs font-medium text-ai">
    <Sparkles className="size-3.5 shrink-0" aria-hidden="true" /> {children}
  </p>
);
