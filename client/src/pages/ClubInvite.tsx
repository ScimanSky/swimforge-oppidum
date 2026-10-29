import { useEffect, useId } from "react";
import { useRoute } from "wouter";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

export default function ClubInvite() {
  const titleId = useId();
  const [match, params] = useRoute("/community/invite/:code");
  const code = params?.code ?? "";

  const acceptInvite = trpc.community.clubs.acceptInvite.useMutation();

  useEffect(() => {
    if (match && code && !acceptInvite.isPending && !acceptInvite.data && !acceptInvite.error) {
      acceptInvite.mutate({ code });
    }
  }, [match, code, acceptInvite]);

  const clubId = acceptInvite.data?.clubId;

  return (
    <AppLayout>
      <section aria-labelledby={titleId} className="surface-panel mx-auto max-w-lg space-y-4 p-4 text-center">
        <h2 id={titleId} className="text-[17px] font-bold">
          Invito al club
        </h2>
        <div role="status" className="text-sm">
          {acceptInvite.isPending && <p className="text-muted-foreground">Sto accettando l’invito…</p>}
          {acceptInvite.error && (
            <p className="text-danger">Invito non valido o scaduto. Contatta l’admin del club.</p>
          )}
          {acceptInvite.data && <p className="font-semibold text-success">Sei entrato nel club.</p>}
        </div>
        <div className="flex flex-col gap-2">
          {clubId && (
            <Button asChild>
              <a href={`/community/club/${clubId}`}>Vai al club</a>
            </Button>
          )}
          <Button variant="outline" asChild>
            <a href="/home/community">Torna alla community</a>
          </Button>
        </div>
      </section>
    </AppLayout>
  );
}
