// The Higgins AI logo, from public/brand/ (web-sized copies of the artwork in
// frontend/brand-source/). The mark reads on both themes; the full logo has a light and a dark
// version, and the page's theme shows one (a style rule, so it never flashes the wrong one).

import { cn } from "@/lib/utils";

/** The mark alone. Decorative by default: give `alt` where it stands in for the name. */
export const LogoMark = ({ className, alt = "" }: { className?: string; alt?: string }) => (
  <img src="/brand/mark.png" alt={alt} width={256} height={256} draggable={false} className={cn("size-10 shrink-0 select-none", className)} />
);

/** The mark and the name. Its height sets the size; the width follows. */
export function LogoFull({ className, alt = "Higgins AI" }: { className?: string; alt?: string }) {
  const img = "w-auto shrink-0 select-none";
  return (
    <>
      <img src="/brand/full.png" alt={alt} width={512} height={128} draggable={false} className={cn("h-9", img, "[[data-theme=dark]_&]:hidden", className)} />
      <img src="/brand/full-dark.png" alt={alt} width={512} height={128} draggable={false} className={cn("hidden h-9", img, "[[data-theme=dark]_&]:block", className)} />
    </>
  );
}
