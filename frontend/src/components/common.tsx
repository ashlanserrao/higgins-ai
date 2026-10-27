// Small building blocks shared by every section. Status is never colour alone:
// each badge pairs an icon with a word.

import type { ReactNode } from "react";
import {
  AlertTriangle, BadgeCheck, Calculator, CheckCircle2, CircleDashed, Clock, Sparkles, XCircle, type LucideIcon,
} from "lucide-react";
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

export function Panel({ title, icon: Icon, description, actions, children, className, tone }: {
  title?: ReactNode; icon?: LucideIcon; description?: ReactNode; actions?: ReactNode;
  children: ReactNode; className?: string; tone?: "ai";
}) {
  return (
    <section className={cn("rounded-xl bg-card p-5 shadow-card md:p-7", tone === "ai" && "bg-ai-soft ring-1 ring-ai-border", className)}>
      {(title || actions) && (
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            {Icon && (
              <span className={cn("rounded-[10px] p-2", tone === "ai" ? "bg-ai-tint text-ai" : "bg-surface-soft text-muted-foreground")}>
                <Icon className="size-4" aria-hidden="true" />
              </span>
            )}
            <div className="min-w-0">
              {title && <h2 className="text-lg md:text-xl">{title}</h2>}
              {description && <div className="mt-1 text-sm text-muted-foreground">{description}</div>}
            </div>
          </div>
          {actions && <div className="no-print flex flex-wrap gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, unit, hint, badge, tone, highlight }: {
  label: string; value: ReactNode; unit?: string; hint?: ReactNode; badge?: ReactNode;
  tone?: "success" | "danger"; highlight?: boolean;
}) {
  return (
    <div className={cn("rounded-xl bg-card p-5 shadow-card", tone === "success" && "ring-1 ring-success-border", tone === "danger" && "ring-1 ring-danger-border")}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-muted-foreground">{label}</p>
        {badge}
      </div>
      <p className={cn("num font-display mt-2 text-2xl md:text-3xl", highlight && "text-primary-text")}>
        {value}
        {unit && <span className="ml-1.5 font-sans text-sm text-muted-foreground">{unit}</span>}
      </p>
      {hint && <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export const FieldError = ({ id, children }: { id?: string; children?: ReactNode }) =>
  children ? (
    <p id={id} className="flex items-center gap-1.5 text-xs font-medium text-danger">
      <XCircle className="size-3.5 shrink-0" aria-hidden="true" /> {children}
    </p>
  ) : null;

export const EmptyState = ({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children?: ReactNode }) => (
  <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-input bg-surface/60 p-10 text-center">
    <Icon className="size-6 text-muted-foreground" aria-hidden="true" />
    <p className="font-display text-lg">{title}</p>
    {children && <div className="max-w-md text-sm text-muted-foreground">{children}</div>}
  </div>
);
