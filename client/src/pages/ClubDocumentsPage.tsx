/**
 * The club's shared PDFs (members only; the shell header carries the «Documenti» title and the
 * back button to the club).
 */

import { useRoute } from "wouter";
import { AppLayout } from "@/components/AppLayout";
import ClubDocumentsPanel from "@/components/club/ClubDocumentsPanel";
import { ClubAccessState } from "@/components/club/ClubPageState";
import { clubAccess } from "@/lib/club-access";
import { trpc } from "@/lib/trpc";

/** Roles that may upload a PDF (the server checks the same list). */
const UPLOAD_ROLES = ["owner", "admin", "moderator", "coach"];

export default function ClubDocumentsPage() {
  const [match, params] = useRoute("/community/club/:clubId/documents");
  const clubId = Number(params?.clubId);

  const clubQuery = trpc.community.clubs.get.useQuery(
    { clubId },
    { enabled: match && Number.isFinite(clubId) },
  );

  if (!match || !Number.isFinite(clubId)) return null;

  const access = clubAccess(clubQuery);
  if (access !== "member") {
    return (
      <AppLayout>
        <ClubAccessState
          access={access}
          clubId={clubId}
          loadingLabel="Caricamento dei documenti…"
          notMemberText="Iscriviti al club per vedere i documenti."
          onRetry={() => void clubQuery.refetch()}
        />
      </AppLayout>
    );
  }

  const club = clubQuery.data as any;
  const canUpload = UPLOAD_ROLES.includes(String(club.member_role ?? ""));

  return (
    <AppLayout>
      <ClubDocumentsPanel clubId={clubId} isMember canUpload={canUpload} clubName={club.name} />
    </AppLayout>
  );
}
