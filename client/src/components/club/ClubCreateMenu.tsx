import { useRef } from "react";
import { CalendarPlus, Plus, SquarePen, Trophy, UserPlus, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Who may create a meet call (server: club staff and coaches). */
const MEET_ROLES = new Set(["owner", "admin", "moderator", "coach"]);
/** Who may invite (server: club staff only, not coaches). */
const INVITE_ROLES = new Set(["owner", "admin", "moderator"]);

type ClubCreateMenuProps = {
  /** The member's club role («member», «coach», «owner»…): the menu is for members only. */
  role: string | null | undefined;
  /** Meets feature flag: «Nuova convocazione» only with it on. */
  meetsEnabled: boolean;
  onPost: () => void;
  onCreateEvent: () => void;
  onCreateMeet: () => void;
  onInvite: () => void;
};

/**
 * The club's «Crea» menu, in the club header at every width: only what the member may create
 * (a post and an event for everyone, a meet call for staff and coaches, an invite for staff).
 */
export default function ClubCreateMenu({
  role,
  meetsEnabled,
  onPost,
  onCreateEvent,
  onCreateMeet,
  onInvite,
}: ClubCreateMenuProps) {
  // The chosen action runs once the menu has closed: a dialog or the composer then keeps the
  // focus instead of losing it to «Crea», and two modal layers never overlap.
  const pendingRef = useRef<(() => void) | null>(null);
  const memberRole = role ?? "";
  const items: Array<{ label: string; icon: LucideIcon; run: () => void }> = [
    { label: "Nuovo post", icon: SquarePen, run: onPost },
    ...(meetsEnabled && MEET_ROLES.has(memberRole)
      ? [{ label: "Nuova convocazione", icon: Trophy, run: onCreateMeet }]
      : []),
    { label: "Nuovo evento", icon: CalendarPlus, run: onCreateEvent },
    ...(INVITE_ROLES.has(memberRole) ? [{ label: "Invita", icon: UserPlus, run: onInvite }] : []),
  ];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {/* The shell has its own «Crea» on desktop: the name tells them apart. */}
        <Button aria-label="Crea nel club">
          <Plus aria-hidden />
          Crea
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-56"
        onCloseAutoFocus={(event) => {
          const run = pendingRef.current;
          if (!run) return;
          pendingRef.current = null;
          event.preventDefault();
          run();
        }}
      >
        {items.map((item) => (
          <DropdownMenuItem
            key={item.label}
            className="min-h-11 gap-3 text-[15px] font-semibold"
            onSelect={() => {
              pendingRef.current = item.run;
            }}
          >
            <item.icon className="size-5 text-action-text" aria-hidden />
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
