import { useState, type ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { Film, RefreshCw } from "lucide-react";
import { SeasonRecapPlayer } from "./SeasonRecapPlayer";

export function SeasonRecapDialog({
  triggerLabel = "Guarda recap video",
  buttonVariant = "outline-neon",
}: {
  triggerLabel?: string;
  buttonVariant?: ComponentProps<typeof Button>["variant"];
}) {
  const [open, setOpen] = useState(false);
  const recapQuery = trpc.video.seasonRecap.useQuery(undefined, {
    enabled: open,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={buttonVariant} size="sm" className="gap-2">
          <Film className="size-4" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Season Recap Video</DialogTitle>
        </DialogHeader>

        {recapQuery.isLoading ? (
          <div className="flex h-[320px] items-center justify-center rounded-xl border border-border/70 bg-card/40 text-sm text-muted-foreground">
            Generazione recap...
          </div>
        ) : recapQuery.error ? (
          <div className="rounded-xl border border-destructive/50 bg-destructive/10 p-4">
            <p className="text-sm text-foreground">Impossibile caricare il recap video.</p>
            <p className="mt-1 text-xs text-muted-foreground">{recapQuery.error.message}</p>
            <Button
              size="sm"
              variant="outline-neon"
              className="mt-3 gap-2"
              onClick={() => recapQuery.refetch()}
            >
              <RefreshCw className="size-3.5" />
              Riprova
            </Button>
          </div>
        ) : recapQuery.data ? (
          <SeasonRecapPlayer data={recapQuery.data} />
        ) : (
          <div className="rounded-xl border border-border/70 bg-card/40 p-4 text-sm text-muted-foreground">
            Nessun dato disponibile per il recap.
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
