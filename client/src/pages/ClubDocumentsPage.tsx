import { Link, useRoute } from "wouter";
import AppLayout from "@/components/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, FileText } from "lucide-react";
import { trpc } from "@/lib/trpc";
import ClubDocumentsPanel from "@/components/club/ClubDocumentsPanel";

export default function ClubDocumentsPage() {
  const [match, params] = useRoute("/community/club/:clubId/documents");
  const clubId = Number(params?.clubId);

  const clubQuery = trpc.community.clubs.get.useQuery(
    { clubId },
    { enabled: match && Number.isFinite(clubId) },
  );

  if (!match || !Number.isFinite(clubId)) return null;

  if (clubQuery.isLoading) {
    return (
      <AppLayout>
        <div className="container py-6">
          <div className="surface-panel p-6 text-center text-muted-foreground">Caricamento documenti...</div>
        </div>
      </AppLayout>
    );
  }

  const club = clubQuery.data as any | undefined;
  if (!club || !club.is_member) {
    return (
      <AppLayout>
        <div className="container py-6 space-y-4">
          <Link href={`/community/club/${clubId}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Torna al club
          </Link>
          <div className="surface-panel p-6 text-center text-muted-foreground">
            Devi essere iscritto al club per vedere i documenti.
          </div>
        </div>
      </AppLayout>
    );
  }

  const role = String(club.member_role ?? "");
  const canUpload = ["owner", "admin", "moderator", "coach"].includes(role);

  return (
    <AppLayout>
      <div className="container py-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <Link href={`/community/club/${clubId}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" /> Torna al club
            </Link>
            <h1 className="mt-1 inline-flex items-center gap-2 text-2xl font-display font-bold">
              <FileText className="h-5 w-5 text-primary" />
              Documenti Club • {club.name}
            </h1>
          </div>
          <Badge variant="outline">{role || "member"}</Badge>
        </div>

        <ClubDocumentsPanel clubId={clubId} isMember={true} canUpload={canUpload} />

        <div className="flex justify-end">
          <Link href={`/community/club/${clubId}`}>
            <Button variant="outline-neon" size="sm">Torna al feed club</Button>
          </Link>
        </div>
      </div>
    </AppLayout>
  );
}

