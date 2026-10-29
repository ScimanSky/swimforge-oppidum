import { useId } from "react";
import { Link } from "wouter";
import { SearchX } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { homePathForPlatform } from "@/lib/navigation";
import { isNativePlatform } from "@/lib/platform";

/** Unknown path inside the shell (the shell's h1 says «SwimForge»): a card and the way home. */
export default function NotFound() {
  const titleId = useId();
  return (
    <AppLayout>
      <section aria-labelledby={titleId} className="surface-panel mx-auto max-w-lg p-6 text-center">
        <SearchX className="mx-auto size-10 text-muted-foreground" aria-hidden />
        <h2 id={titleId} className="mt-3 text-[17px] font-bold">
          Pagina non trovata
        </h2>
        <p className="mt-1 text-[15px] text-muted-foreground">
          La pagina che cerchi non esiste o è stata spostata.
        </p>
        <Button asChild className="mt-5">
          <Link href={homePathForPlatform(isNativePlatform())}>Torna alla home</Link>
        </Button>
      </section>
    </AppLayout>
  );
}
