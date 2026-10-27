// Open a before/after preview for an edit (/api/compare). Used by quick actions, money moves
// and the guest list's "plan for N guests".

import { useState, type ReactNode } from "react";
import { ChangeDialog } from "@/components/app/change-dialog";
import { api } from "@/lib/api";
import type { PlanEdit } from "@/lib/types";
import { usePlan } from "@/state/planner";

interface Pending {
  title: string;
  label: string;
  changes: PlanEdit;
  description?: ReactNode;
}

export function useChangePreview() {
  const { inputs } = usePlan();
  const [pending, setPending] = useState<Pending | null>(null);
  const [open, setOpen] = useState(false);

  const preview = (next: Pending) => {
    setPending(next);
    setOpen(true);
  };

  const dialog = pending && (
    <ChangeDialog
      open={open}
      onOpenChange={setOpen}
      title={pending.title}
      description={pending.description}
      label={pending.label}
      load={() => api.compare(inputs, pending.changes)}
    />
  );

  return { preview, dialog };
}
