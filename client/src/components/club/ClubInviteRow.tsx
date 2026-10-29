import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { publicSiteUrl } from "@/lib/public-url";

type ClubInvite = { code: string; usedCount?: number | null; maxUses?: number | null };

/** One club invite: its public link, «used/max» and a copy button that says when it worked. */
export function ClubInviteRow({ invite }: { invite: ClubInvite }) {
  const [copied, setCopied] = useState(false);
  const resetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const link = publicSiteUrl(`/community/invite/${invite.code}`);

  useEffect(() => () => {
    if (resetRef.current) clearTimeout(resetRef.current);
  }, []);

  const copyLink = () => {
    // Inside the promise: without a clipboard (insecure page) `writeText` throws at once.
    Promise.resolve()
      .then(() => navigator.clipboard.writeText(link))
      .then(() => {
        setCopied(true);
        if (resetRef.current) clearTimeout(resetRef.current);
        resetRef.current = setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => toast.error("Non riesco a copiare il link"));
  };

  return (
    <div className="flex min-w-0 items-center gap-2 rounded-xl bg-raised py-1 pl-3 pr-1 text-sm">
      <code className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{link}</code>
      <span className="text-xs text-muted-foreground tabular-nums">
        {Number(invite.usedCount ?? 0)}/{Number(invite.maxUses ?? 0)}
      </span>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={copied ? "Link copiato" : "Copia link"}
        className="shrink-0"
        onClick={copyLink}
      >
        {copied ? <Check className="size-4 text-success" aria-hidden /> : <Copy className="size-4" aria-hidden />}
      </Button>
    </div>
  );
}
