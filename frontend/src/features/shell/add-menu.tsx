// The Add menu: "Something changed?" shortcuts that open the right tool with its first field
// focused. In the sidebar, the folded rail and the phone's top bar.

import { useRef } from "react";
import { CalendarCheck, Plus, ReceiptIndianRupee, UserPlus, Wallet, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useNav, type Intent, type Section } from "@/state/nav";

/** `rail`: the folded sidebar's, an icon that opens to its right. */
export function AddMenu({ className, rail = false }: { className?: string; rail?: boolean }) {
  const { go } = useNav();
  const items: { label: string; icon: LucideIcon; section: Section; intent: Intent }[] = [
    { label: "Add a quote", icon: ReceiptIndianRupee, section: "vendors", intent: "add-quote" },
    { label: "Mark a booking", icon: CalendarCheck, section: "tasks", intent: "mark-booking" },
    { label: "Add a guest", icon: UserPlus, section: "guests", intent: "add-guest" },
    { label: "Move money", icon: Wallet, section: "budget", intent: "move-money" },
  ];
  // A chosen item opens its tool with the first field focused. The menu holds focus until it
  // has fully closed, so the page changes only then; a menu closed without a choice hands
  // focus back to Add.
  const chosen = useRef<{ section: Section; intent: Intent } | null>(null);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size={rail ? "icon" : "default"} className={className} aria-label="Add" title={rail ? "Add" : undefined}>
          <Plus aria-hidden="true" /> {!rail && <span className="hidden sm:inline">Add</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start" side={rail ? "right" : undefined} className="w-56"
        onCloseAutoFocus={(event) => {
          if (!chosen.current) return;
          event.preventDefault();
          go(chosen.current.section, chosen.current.intent);
          chosen.current = null;
        }}
      >
        <DropdownMenuLabel>Something changed?</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.map(({ label, icon: Icon, section, intent }) => (
          <DropdownMenuItem key={label} onSelect={() => (chosen.current = { section, intent })}>
            <Icon aria-hidden="true" /> {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
