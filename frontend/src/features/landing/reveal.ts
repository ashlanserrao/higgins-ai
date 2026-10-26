// One-time scroll reveals for the landing page. Parts marked `data-reveal` fade in and rise as
// they first enter the viewport (`data-reveal="children"` moves a cell's contents and leaves its
// background, which masks the hairline grid, in place). Dashed section rules draw across. Each
// part is revealed once and then left alone. The motion itself lives in index.css, which skips
// it for print and for visitors who prefer reduced motion.

import { useEffect, type RefObject } from "react";

const TARGETS = "[data-reveal], .section-rule:not(.section-rule-solid)";
const STAGGER_MS = 60;

export function useReveal(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const targets = root.current?.querySelectorAll<HTMLElement>(TARGETS);
    if (!targets?.length) return;
    const reveal = (el: HTMLElement) => el.setAttribute("data-revealed", "");
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) {
      targets.forEach(reveal);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      // Parts that arrive together (the cells of a strip) follow one another.
      let order = 0;
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const el = entry.target as HTMLElement;
        if (el.hasAttribute("data-reveal")) el.style.setProperty("--reveal-delay", `${order++ * STAGGER_MS}ms`);
        reveal(el);
        observer.unobserve(el);
      }
    }, { rootMargin: "0px 0px -8% 0px" });
    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [root]);
}
