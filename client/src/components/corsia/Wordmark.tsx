import { Droplet } from "lucide-react";
import { cn } from "@/lib/utils";

/** SwimForge wordmark: action-blue drop and the name in Barlow (shell header, public pages). */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <Droplet className="size-6 fill-current text-action-text" aria-hidden />
      <span className="font-display text-[26px] font-bold leading-none text-foreground">SwimForge</span>
    </span>
  );
}
