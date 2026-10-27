import type { ReactNode } from "react";
import { XCircle } from "lucide-react";

/** A field's error, linked by `id` from the field's aria-describedby. Renders nothing when empty. */
export const FieldError = ({ id, children }: { id?: string; children?: ReactNode }) =>
  children ? (
    <p id={id} className="flex items-center gap-1.5 text-xs font-medium text-danger">
      <XCircle className="size-3.5 shrink-0" aria-hidden="true" /> {children}
    </p>
  ) : null;
