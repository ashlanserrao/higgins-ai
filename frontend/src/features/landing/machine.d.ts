// <higgins-how-it-works>: the landing hero's "how it works" machine, a framework-free web
// component served from public/hm/. Its loader defines the element at runtime.
import type { DetailedHTMLProps, HTMLAttributes } from "react";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "higgins-how-it-works": DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        src: string;
        poster: string;
        ratio: string;
      };
    }
  }
}
