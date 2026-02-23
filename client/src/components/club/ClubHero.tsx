import { motion } from "framer-motion";
import { Users, Settings, ArrowLeft, Calendar, Database, ExternalLink, FileText, Shield, Trophy } from "lucide-react";
import { Link } from "wouter";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface ClubHeroProps {
  club: {
    id: number;
    name: string;
    description?: string | null;
    cover_image_url?: string | null;
    website_url?: string | null;
    theme_color?: string | null;
    logo_url?: string | null;
    tagline?: string | null;
    visibility: string;
    member_count: number;
    member_role?: string | null;
    is_member: boolean;
    owner_id: number;
  };
  onOpenMembers: () => void;
  onOpenSettings: () => void;
  onJoin: () => void;
  onLeave: () => void;
  isJoining?: boolean;
  isLeaving?: boolean;
  variant?: "full" | "compactSticky";
  eventsPageHref?: string | null;
  meetsPageHref?: string | null;
  historyPageHref?: string | null;
  documentsPageHref?: string | null;
  coachPageHref?: string | null;
  hasActiveMeet?: boolean;
}

const themeColorMap: Record<string, string> = {
  cyan: "var(--electric-cyan)",
  lime: "var(--electric-lime)",
  coral: "var(--electric-coral)",
  violet: "var(--electric-violet)",
};

export default function ClubHero({
  club,
  onOpenMembers,
  onOpenSettings,
  onJoin,
  onLeave,
  isJoining,
  isLeaving,
  variant = "full",
  eventsPageHref,
  meetsPageHref,
  historyPageHref,
  documentsPageHref,
  coachPageHref,
  hasActiveMeet = false,
}: ClubHeroProps) {
  const color = themeColorMap[club.theme_color ?? "cyan"] ?? themeColorMap.cyan;
  const isStaff = ["owner", "admin", "moderator"].includes(club.member_role ?? "");
  const gareHref = meetsPageHref ?? eventsPageHref ?? null;

  if (variant === "compactSticky") {
    return (
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="surface-panel w-full overflow-hidden rounded-xl px-2.5 py-2"
        style={{ borderColor: color, borderWidth: "1px" }}
      >
        {club.cover_image_url ? (
          <img
            src={club.cover_image_url}
            alt=""
            className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-35"
          />
        ) : null}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-background/44 via-background/72 to-background/88" />

        <div className="relative z-10 flex items-start gap-2">
          <Link href="/home/community">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
            </Button>
          </Link>

          <Avatar className="h-10 w-10 border-2 shrink-0" style={{ borderColor: color }}>
            <AvatarImage src={club.logo_url ?? undefined} />
            <AvatarFallback style={{ color }} className="text-sm font-bold font-display">
              {club.name.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[15px] font-bold font-display leading-tight" style={{ color }}>
              {club.name}
            </h1>
            {club.tagline ? (
              <p className="mt-0.5 hidden truncate text-[11px] text-muted-foreground sm:block">{club.tagline}</p>
            ) : null}
            <div className="mt-1.5 flex flex-wrap items-center gap-1">
              <Badge variant="outline" className="h-4 px-1 text-[9px]" style={{ borderColor: color, color }}>
                {club.member_count} membri
              </Badge>
              <Badge variant="outline" className="h-4 px-1 text-[9px] capitalize">
                {club.visibility}
              </Badge>
              {club.member_role ? (
                <Badge variant="outline" className="h-4 px-1 text-[9px]" style={{ borderColor: color, color }}>
                  {club.member_role}
                </Badge>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={onOpenMembers}
            >
              <Users className="h-3.5 w-3.5" />
            </Button>
            {isStaff ? (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={onOpenSettings}
              >
                <Settings className="h-3.5 w-3.5" />
              </Button>
            ) : null}
          </div>
        </div>

        <div className="relative z-10 mt-2 flex flex-wrap items-center gap-2">
          {eventsPageHref ? (
            <Link href={eventsPageHref}>
              <Button className="h-7 text-[11px]" variant="outline-neon" size="sm">
                <Calendar className="mr-1.5 h-3.5 w-3.5" />
                Eventi
              </Button>
            </Link>
          ) : null}
          {meetsPageHref ? (
            <Link href={meetsPageHref}>
              <Button
                className={`h-7 text-[11px] ${hasActiveMeet ? "animate-pulse border-amber-400 text-amber-300 shadow-[0_0_16px_rgba(251,191,36,0.45)]" : ""}`}
                variant="outline-neon"
                size="sm"
              >
                <Trophy className="mr-1.5 h-3.5 w-3.5" />
                Gare
              </Button>
            </Link>
          ) : null}
          {historyPageHref ? (
            <Link href={historyPageHref}>
              <Button className="h-7 text-[11px]" variant="outline-neon" size="sm">
                <Database className="mr-1.5 h-3.5 w-3.5" />
                Storico
              </Button>
            </Link>
          ) : null}
          {documentsPageHref ? (
            <Link href={documentsPageHref}>
              <Button className="h-7 text-[11px]" variant="outline-neon" size="sm">
                <FileText className="mr-1.5 h-3.5 w-3.5" />
                Documenti
              </Button>
            </Link>
          ) : null}
          {isStaff && coachPageHref ? (
            <Link href={coachPageHref}>
              <Button className="h-7 text-[11px]" variant="outline-neon" size="sm">
                <Shield className="mr-1.5 h-3.5 w-3.5" />
                Area Coach
              </Button>
            </Link>
          ) : null}

          {!club.is_member ? (
            <Button className="h-7 text-[11px]" variant="neon" onClick={onJoin} disabled={isJoining}>
              {isJoining ? "Richiesta..." : club.visibility === "public" ? "Unisciti al club" : "Richiedi accesso"}
            </Button>
          ) : club.member_role !== "owner" ? (
            <Button className="h-7 text-[11px]" variant="ghost" size="sm" onClick={onLeave} disabled={isLeaving}>
              {isLeaving ? "Uscita..." : "Lascia club"}
            </Button>
          ) : null}
        </div>

      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative w-full overflow-hidden rounded-[26px]"
      style={{ borderColor: color, borderWidth: "1px" }}
    >
      {/* Cover image */}
      <div className="relative h-36 bg-gradient-to-br from-surface-panel to-black/60 sm:h-48">
        {club.cover_image_url && (
          <img src={club.cover_image_url} alt="" className="absolute inset-0 w-full h-full object-cover opacity-60" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
        {/* Back button */}
        <Link href="/home/community">
          <Button variant="ghost" size="icon" className="absolute top-3 left-3 text-white/80 hover:text-white">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        {/* Action icons */}
        <div className="absolute top-3 right-3 flex gap-2">
          <Button variant="ghost" size="icon" className="text-white/80 hover:text-white" onClick={onOpenMembers}>
            <Users className="h-5 w-5" />
          </Button>
          {isStaff && (
            <Button variant="ghost" size="icon" className="text-white/80 hover:text-white" onClick={onOpenSettings}>
              <Settings className="h-5 w-5" />
            </Button>
          )}
        </div>
      </div>

      {/* Club info overlay */}
      <div className="relative -mt-10 px-5 pb-5">
        <div className="flex items-end gap-3">
          {/* Logo */}
          <Avatar className="h-16 w-16 border-2" style={{ borderColor: color }}>
            <AvatarImage src={club.logo_url ?? undefined} />
            <AvatarFallback style={{ color }} className="text-xl font-bold font-display">
              {club.name.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold font-display truncate" style={{ color }}>
              {club.name}
            </h1>
            {club.tagline && (
              <p className="text-sm text-muted-foreground truncate">{club.tagline}</p>
            )}
          </div>
        </div>

        {/* Meta row */}
        <div className="flex items-center gap-3 mt-3">
          <Badge variant="outline" className="text-xs" style={{ borderColor: color, color }}>
            {club.member_count} membri
          </Badge>
          <Badge variant="outline" className="text-xs capitalize">
            {club.visibility}
          </Badge>
          {club.member_role && (
            <Badge variant="outline" className="text-xs" style={{ borderColor: color, color }}>
              {club.member_role}
            </Badge>
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {gareHref ? (
            <Link href={gareHref}>
              <Button
                className={`${hasActiveMeet ? "animate-pulse border-amber-400 text-amber-300 shadow-[0_0_16px_rgba(251,191,36,0.45)]" : ""}`}
                variant="outline-neon"
                size="sm"
              >
                <Trophy className="mr-1.5 h-3.5 w-3.5" />
                Gare
              </Button>
            </Link>
          ) : null}
          {historyPageHref ? (
            <Link href={historyPageHref}>
              <Button variant="outline-neon" size="sm">
                <Database className="mr-1.5 h-3.5 w-3.5" />
                Storico
              </Button>
            </Link>
          ) : null}
          {documentsPageHref ? (
            <Link href={documentsPageHref}>
              <Button variant="outline-neon" size="sm">
                <FileText className="mr-1.5 h-3.5 w-3.5" />
                Documenti
              </Button>
            </Link>
          ) : null}
          {isStaff && coachPageHref ? (
            <Link href={coachPageHref}>
              <Button variant="outline-neon" size="sm">
                <Shield className="mr-1.5 h-3.5 w-3.5" />
                Area Coach
              </Button>
            </Link>
          ) : null}
        </div>
        {club.website_url ? (
          <a
            href={club.website_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[var(--electric-cyan)] underline-offset-2 hover:underline"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Sito del club
          </a>
        ) : null}

        {/* Join/Leave */}
        {!club.is_member ? (
          <Button className="mt-3 w-full" variant="neon" onClick={onJoin} disabled={isJoining}>
            {isJoining ? "Richiesta..." : club.visibility === "public" ? "Unisciti" : "Richiedi accesso"}
          </Button>
        ) : club.member_role !== "owner" ? (
          <Button className="mt-3" variant="ghost" size="sm" onClick={onLeave} disabled={isLeaving}>
            Lascia club
          </Button>
        ) : null}
      </div>
    </motion.div>
  );
}
