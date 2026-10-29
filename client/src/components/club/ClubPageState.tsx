import type { ReactNode } from "react";
import { LoadError, LoadingSkeleton, Notice } from "@/components/corsia/LoadState";
import type { ClubAccess } from "@/lib/club-access";

/** A short message in a card («Evento non trovato.»), with an optional way back to the club. */
export function ClubNotice({
  backLabel = "Torna al club",
  ...props
}: {
  children: ReactNode;
  backHref?: string;
  backLabel?: string;
  className?: string;
}) {
  return <Notice backLabel={backLabel} {...props} />;
}

/**
 * What a members-only club page shows until the swimmer is known to be a member: skeleton,
 * «Riprova» on a load error, «Club non trovato.» or the members-only message.
 */
export function ClubAccessState({
  access,
  clubId,
  loadingLabel,
  notMemberText,
  onRetry,
}: {
  access: Exclude<ClubAccess, "member">;
  clubId: number;
  loadingLabel: string;
  notMemberText: string;
  onRetry: () => void;
}) {
  if (access === "loading") {
    return <LoadingSkeleton label={loadingLabel} count={3} itemClassName="h-24 w-full rounded-2xl" />;
  }
  if (access === "error") return <LoadError onRetry={onRetry} />;
  if (access === "not-found") {
    return (
      <ClubNotice backHref="/home/community" backLabel="Torna alla community">
        Club non trovato.
      </ClubNotice>
    );
  }
  return <ClubNotice backHref={`/community/club/${clubId}`}>{notMemberText}</ClubNotice>;
}
