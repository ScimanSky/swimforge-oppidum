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
    const showEventsButton = Boolean(eventsPageHref && (!meetsPageHref || eventsPageHref !== meetsPageHref));
    const compactActionClass = "h-6 w-full min-w-0 px-1 text-[9px] sm:text-[10px]";

    return (
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="surface-panel w-full overflow-hidden rounded-xl px-2 py-1.5"
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

        <div className="relative z-10 grid grid-cols-[auto_1fr_auto] items-start gap-1.5">
          <Avatar className="h-8 w-8 shrink-0 self-start border-2" style={{ borderColor: color }}>
            <AvatarImage src={club.logo_url ?? undefined} />
            <AvatarFallback style={{ color }} className="text-xs font-bold font-display">
              {club.name.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0">
            <h1 className="truncate text-[12px] font-bold font-display leading-tight" style={{ color }}>
              {club.name}
            </h1>
            <p className="truncate text-[9px] text-muted-foreground">{club.member_count} membri</p>
          </div>

          <div className="flex items-center justify-end gap-0.5">
            <Link href="/home/community">
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 shrink-0 text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-3 w-3" />
              </Button>
            </Link>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 text-muted-foreground hover:text-foreground"
              onClick={onOpenMembers}
            >
              <Users className="h-2.5 w-2.5" />
            </Button>
            {isStaff ? (
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 text-muted-foreground hover:text-foreground"
                onClick={onOpenSettings}
              >
                <Settings className="h-2.5 w-2.5" />
              </Button>
            ) : null}
          </div>
        </div>

        <div className="relative z-10 mt-1.5">
          <div className="grid grid-cols-3 gap-1">
          {showEventsButton ? (
            <Link href={eventsPageHref!} className="min-w-0">
              <Button className={compactActionClass} variant="outline-neon" size="sm">
                <Calendar className="mr-1 h-2.5 w-2.5" />
                Eventi
              </Button>
            </Link>
          ) : null}
          {meetsPageHref ? (
            <Link href={meetsPageHref} className="min-w-0">
              <Button
                className={`${compactActionClass} ${hasActiveMeet ? "animate-pulse border-amber-400 text-amber-300 shadow-[0_0_16px_rgba(251,191,36,0.45)]" : ""}`}
                variant="outline-neon"
                size="sm"
              >
                <Trophy className="mr-1 h-2.5 w-2.5" />
                Gare
              </Button>
            </Link>
          ) : null}
          {historyPageHref ? (
            <Link href={historyPageHref} className="min-w-0">
              <Button className={compactActionClass} variant="outline-neon" size="sm">
                <Database className="mr-1 h-2.5 w-2.5" />
                Storico
              </Button>
            </Link>
          ) : null}
          {documentsPageHref ? (
            <Link href={documentsPageHref} className="min-w-0">
              <Button className={compactActionClass} variant="outline-neon" size="sm">
                <FileText className="mr-1 h-2.5 w-2.5" />
                Documenti
              </Button>
            </Link>
          ) : null}
          {isStaff && coachPageHref ? (
            <Link href={coachPageHref} className="min-w-0">
              <Button className={compactActionClass} variant="outline-neon" size="sm">
                <Shield className="mr-1 h-2.5 w-2.5" />
                Coach
              </Button>
            </Link>
          ) : null}

          {!club.is_member ? (
            <Button className={compactActionClass} variant="neon" onClick={onJoin} disabled={isJoining}>
              {isJoining ? "Richiesta..." : club.visibility === "public" ? "Unisciti" : "Richiedi accesso"}
            </Button>
          ) : club.member_role !== "owner" ? (
            <Button className={compactActionClass} variant="ghost" size="sm" onClick={onLeave} disabled={isLeaving}>
              {isLeaving ? "Uscita..." : "Esci"}
            </Button>
          ) : null}
          </div>
        </div>

      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative w-full overflow-hidden rounded-2xl sm:rounded-[26px]"
      style={{ borderColor: color, borderWidth: "1px" }}
    >
      {/* Cover image */}
      <div className="relative h-20 bg-gradient-to-br from-surface-panel to-black/60 sm:h-48">
        {club.cover_image_url && (
          <img src={club.cover_image_url} alt="" className="absolute inset-0 w-full h-full object-cover opacity-60" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
        {/* Mobile logo (top-left) */}
        <div className="absolute left-2 top-2 sm:hidden">
          <Avatar className="h-9 w-9 border-2" style={{ borderColor: color }}>
            <AvatarImage src={club.logo_url ?? undefined} />
            <AvatarFallback style={{ color }} className="text-[10px] font-bold font-display">
              {club.name.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </div>
        {/* Back button */}
        <Link href="/home/community">
          <Button variant="ghost" size="icon" className="absolute top-2 right-12 h-8 w-8 text-white/80 hover:text-white sm:top-3 sm:left-3 sm:right-auto sm:h-10 sm:w-10">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        {/* Action icons */}
        <div className="absolute right-2 top-2 flex gap-1 sm:top-3 sm:right-3 sm:gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8 text-white/80 hover:text-white sm:h-10 sm:w-10" onClick={onOpenMembers}>
            <Users className="h-5 w-5" />
          </Button>
          {isStaff && (
            <Button variant="ghost" size="icon" className="h-8 w-8 text-white/80 hover:text-white sm:h-10 sm:w-10" onClick={onOpenSettings}>
              <Settings className="h-5 w-5" />
            </Button>
          )}
        </div>
      </div>

      {/* Club info overlay */}
      <div className="relative px-3 pb-3 sm:-mt-10 sm:px-5 sm:pb-5">
        <div className="flex items-start gap-2 sm:items-end sm:gap-3">
          {/* Logo */}
          <Avatar className="hidden h-16 w-16 border-2 sm:flex" style={{ borderColor: color }}>
            <AvatarImage src={club.logo_url ?? undefined} />
            <AvatarFallback style={{ color }} className="text-xl font-bold font-display">
              {club.name.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <h1 className="truncate pl-11 text-base font-bold font-display sm:pl-0 sm:text-xl" style={{ color }}>
              {club.name}
            </h1>
            {club.tagline && (
              <p className="truncate pl-11 text-xs text-muted-foreground sm:pl-0 sm:text-sm">{club.tagline}</p>
            )}
          </div>
        </div>

        {/* Meta row */}
        <div className="mt-2 flex items-center gap-2 sm:mt-3 sm:gap-3">
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
        <div className="mt-2 flex flex-wrap items-center gap-1.5 sm:gap-2">
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
