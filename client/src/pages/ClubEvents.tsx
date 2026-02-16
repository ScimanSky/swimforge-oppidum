import { Link, useRoute } from "wouter";
import { ArrowLeft } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import ClubEventsTab from "@/components/club/ClubEventsTab";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

export default function ClubEvents() {
  const [match, params] = useRoute("/community/club/:id/events");
  const clubId = Number(params?.id);

  const clubQuery = trpc.community.clubs.get.useQuery(
    { clubId },
    { enabled: match && Number.isFinite(clubId) }
  );

  if (!match || !Number.isFinite(clubId)) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-12">
          <p className="text-muted-foreground">Club non trovato</p>
        </div>
      </AppLayout>
    );
  }

  if (clubQuery.isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-12">
          <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-primary" />
        </div>
      </AppLayout>
    );
  }

  const club = clubQuery.data as any | undefined;
  if (!club) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-12">
          <p className="text-muted-foreground">Club non trovato</p>
        </div>
      </AppLayout>
    );
  }

  const isStaff = ["owner", "admin", "moderator"].includes(club.member_role ?? "");

  return (
    <AppLayout>
      <div className="mx-auto max-w-5xl space-y-4">
        <section className="surface-panel p-3 sm:p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Club</p>
              <h1 className="truncate font-display text-xl font-bold">{club.name} · Eventi</h1>
            </div>
            <Button variant="outline-neon" size="sm" asChild>
              <Link href={`/community/club/${clubId}`}>
                <ArrowLeft className="mr-1.5 h-4 w-4" />
                Torna al club
              </Link>
            </Button>
          </div>
        </section>

        <ClubEventsTab clubId={clubId} isMember={Boolean(club.is_member)} isStaff={isStaff} />
      </div>
    </AppLayout>
  );
}
