// A link to one of the open event's sections. It keeps a real href, so opening it in a new tab
// works, and a plain click moves there in place.

import type { ComponentProps } from "react";
import { routeHash, useNav, type Section } from "@/state/nav";

export function SectionLink({ section, ...props }: { section: Section } & Omit<ComponentProps<"a">, "href" | "onClick">) {
  const { eventId, go } = useNav();
  return (
    <a
      {...props}
      href={routeHash({ eventId, section })}
      onClick={(e) => {
        e.preventDefault();
        go(section);
      }}
    />
  );
}
