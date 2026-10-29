// Page building blocks: cards, figures and empty states.

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function Panel({ title, icon: Icon, description, actions, children, className, tone }: {
  title?: ReactNode; icon?: LucideIcon; description?: ReactNode; actions?: ReactNode;
  children: ReactNode; className?: string; tone?: "ai";
}) {
  return (
    <section className={cn("rounded-xl border bg-card p-5 md:p-7", tone === "ai" && "border-ai-border bg-ai-soft", className)}>
      {(title || actions) && (
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          {/* The title takes the room, so the actions stay at the right end unless it's narrow. */}
          <div className="flex min-w-0 flex-1 basis-60 items-start gap-3">
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
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
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
    <div className={cn("rounded-xl border bg-card p-5", tone === "success" && "border-success-border", tone === "danger" && "border-danger-border")}>
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

export const EmptyState = ({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children?: ReactNode }) => (
  <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-input bg-surface/60 p-10 text-center">
    <Icon className="size-6 text-muted-foreground" aria-hidden="true" />
    <p className="font-display text-lg">{title}</p>
    {children && <div className="max-w-md text-sm text-muted-foreground">{children}</div>}
  </div>
);
