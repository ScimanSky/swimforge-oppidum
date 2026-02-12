import { useEffect } from "react";
import { useRoute } from "wouter";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Surface, SurfaceContent } from "@/components/ui/surface";
import { trpc } from "@/lib/trpc";

export default function ClubInvite() {
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
      <div className="mx-auto w-full max-w-lg py-6 lg:py-3">
        <Surface className="border-border/50 bg-card/70 backdrop-blur-sm">
          <SurfaceContent className="p-6 text-center space-y-4">
            <h1 className="text-xl font-semibold">Invito al Club</h1>
            {acceptInvite.isPending && (
              <p className="text-white/70">Sto accettando l’invito…</p>
            )}
            {acceptInvite.error && (
              <p className="text-red-400">
                Invito non valido o scaduto. Contatta l’admin del club.
              </p>
            )}
            {acceptInvite.data && (
              <p className="text-emerald-300">
                Sei entrato nel club! 🎉
              </p>
            )}
            <div className="flex flex-col gap-2">
              {clubId && (
                <Button className="bg-[var(--azure)] text-primary-foreground" asChild>
                  <a href={`/community/club/${clubId}`}>Vai al club</a>
                </Button>
              )}
              <Button variant="outline" asChild>
                <a href="/community">Torna alla community</a>
              </Button>
            </div>
          </SurfaceContent>
        </Surface>
      </div>
    </AppLayout>
  );
}
