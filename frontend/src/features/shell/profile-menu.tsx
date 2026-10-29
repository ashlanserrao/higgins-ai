// The signed-in account: a circle with its first letter and the username, fixed at the foot
// of the sidebar (just the circle on the folded rail and in the phone's top bar). Opening it
// is the only way to log out.

import { LogOut } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useAuth } from "@/state/auth";
import { useNav } from "@/state/nav";

const Avatar = ({ name }: { name: string }) => (
  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary-soft text-sm font-semibold text-primary-ink" aria-hidden="true">
    {name[0].toUpperCase()}
  </span>
);

/** `sidebar`: circle and name; `rail` and `bar`: the circle alone. */
export function ProfileMenu({ variant }: { variant: "sidebar" | "rail" | "bar" }) {
  const { user, signOut } = useAuth();
  const { openPage } = useNav();
  if (!user) return null;
  const full = variant === "sidebar";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={full ? undefined : `Account: ${user}`} title={full ? undefined : user}
        className={cn(
          "flex items-center rounded-lg text-left transition-colors hover:bg-surface data-[state=open]:bg-surface",
          full ? "w-full gap-3 p-2" : "size-10 justify-center pointer-coarse:size-11",
        )}
      >
        <Avatar name={user} />
        {full && <span className="min-w-0 flex-1 truncate text-sm font-medium">{user}</span>}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side={variant === "bar" ? "bottom" : variant === "rail" ? "right" : "top"}
        align={variant === "bar" ? "end" : "start"}
        className={cn("min-w-56", full && "w-(--radix-dropdown-menu-trigger-width)")}
      >
        <DropdownMenuLabel className="font-normal">
          <span className="block truncate text-sm font-medium">{user}</span>
          <span className="block text-xs text-muted-foreground">Signed in on this browser</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            signOut();
            openPage("welcome");
          }}
        >
          <LogOut aria-hidden="true" /> Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
