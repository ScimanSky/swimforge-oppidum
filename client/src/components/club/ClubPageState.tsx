import type { ReactNode } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { LoadError, LoadingSkeleton } from "@/components/corsia/LoadState";
import type { ClubAccess } from "@/lib/club-access";

/** A short message in a card («Evento non trovato.»), with an optional way back. */
export function ClubNotice({
  children,
  backHref,
  backLabel = "Torna al club",
}: {
  children: ReactNode;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div className="surface-panel p-4 text-center">
      <p className="text-sm text-muted-foreground">{children}</p>
      {backHref ? (
        <Button variant="outline" className="mt-3" asChild>
          <Link href={backHref}>{backLabel}</Link>
        </Button>
      ) : null}
    </div>
  );
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
