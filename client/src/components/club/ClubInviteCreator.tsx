import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { CLUB_ROLE_LABEL, inviteRolesFor } from "@/lib/club-roles";

/**
 * «Genera nuovo invito» with the role the link gives. Owner and admin can also create a
 * single-use «Coach» link; a member link works ten times.
 */
export function ClubInviteCreator({
  actorRole,
  isPending,
  onCreate,
  className,
}: {
  actorRole: string | null | undefined;
  isPending: boolean;
  onCreate: (input: { role: "member" | "coach"; maxUses: number }) => void;
  className?: string;
}) {
  const roles = inviteRolesFor(actorRole);
  const [role, setRole] = useState<"member" | "coach">("member");
  const selectId = useId();

  return (
    <div className={className ?? "flex flex-col gap-2 sm:flex-row sm:items-end"}>
      {roles.length > 1 ? (
        <div className="flex flex-col gap-1">
          <label htmlFor={selectId} className="text-sm font-semibold">
            Ruolo con l'invito
          </label>
          <select
            id={selectId}
            value={role}
            onChange={(event) => setRole(event.target.value as "member" | "coach")}
            className="h-11 rounded-xl border border-border bg-card px-3 text-sm text-foreground"
          >
            {roles.map((value) => (
              <option key={value} value={value}>
                {CLUB_ROLE_LABEL[value]}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <Button
        className="w-full sm:w-auto"
        disabled={isPending}
        onClick={() => onCreate({ role, maxUses: role === "coach" ? 1 : 10 })}
      >
        {isPending ? "Generazione…" : "Genera nuovo invito"}
      </Button>
    </div>
  );
}
