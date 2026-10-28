// Radix locks page scroll behind dialogs, menus and selects through react-remove-scroll-bar,
// which adds its CSS with an injected <style>: the strict CSP (style-src 'self') blocks that.
// vite.config.ts aliases react-style-singleton to this copy. Same API and lifecycle, but it
// adopts a constructed stylesheet, which is CSSOM and not subject to the CSP.

import { useEffect } from "react";

export const stylesheetSingleton = () => {
  let counter = 0;
  let sheet: CSSStyleSheet | null = null;
  return {
    add(style: string) {
      if (counter === 0) {
        sheet = new CSSStyleSheet();
        sheet.replaceSync(style);
        document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
      }
      counter++;
    },
    remove() {
      counter--;
      if (!counter && sheet) {
        const gone = sheet;
        document.adoptedStyleSheets = document.adoptedStyleSheets.filter((s) => s !== gone);
        sheet = null;
      }
    },
  };
};

export const styleHookSingleton = () => {
  const sheet = stylesheetSingleton();
  return (styles: string, isDynamic?: boolean) => {
    useEffect(() => {
      sheet.add(styles);
      return () => sheet.remove();
    }, [styles && isDynamic]);
  };
};

export const styleSingleton = () => {
  const useStyle = styleHookSingleton();
  return function Sheet({ styles, dynamic }: { styles: string; dynamic?: boolean }) {
    useStyle(styles, dynamic);
    return null;
  };
};
