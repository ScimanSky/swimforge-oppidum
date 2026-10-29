import { useId, type ReactNode } from "react";
import { Calendar, Database, Dumbbell, ExternalLink, FileText, Medal, Settings, Shield, Trophy, Users } from "lucide-react";
import { Link } from "wouter";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/corsia/Chip";
import { formatInteger } from "@/lib/format";

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
  eventsPageHref?: string | null;
  meetsPageHref?: string | null;
  historyPageHref?: string | null;
  documentsPageHref?: string | null;
  workoutsPageHref?: string | null;
  pbLeaderboardHref?: string | null;
  coachPageHref?: string | null;
  hasActiveMeet?: boolean;
}

// Same labels as the club directory and the settings form.
const VISIBILITY_LABEL: Record<string, string> = {
  public: "Pubblico",
  private: "Segreto",
  invite: "Privato",
};

const ROLE_LABEL: Record<string, string> = {
  owner: "Proprietario",
  admin: "Admin",
  moderator: "Moderatore",
  member: "Membro",
};

function SectionLink({ href, icon, children }: { href: string; icon: ReactNode; children: ReactNode }) {
  return (
    <li className="shrink-0">
      <Button variant="outline" size="sm" asChild>
        <Link href={href}>
          {icon}
          {children}
        </Link>
      </Button>
    </li>
  );
}

/**
 * Club header (Corsia): cover as a plain banner (no text over it), logo thumbnail, name as
 * the page's h2, meta chips, section links and the join/leave action.
 */
export default function ClubHero({
  club,
  onOpenMembers,
  onOpenSettings,
  onJoin,
  onLeave,
  isJoining,
  isLeaving,
  eventsPageHref,
  meetsPageHref,
  historyPageHref,
  documentsPageHref,
  workoutsPageHref,
  pbLeaderboardHref,
  coachPageHref,
  hasActiveMeet = false,
}: ClubHeroProps) {
  const titleId = useId();
  const isStaff = ["owner", "admin", "moderator"].includes(club.member_role ?? "");
  const showEventsLink = Boolean(eventsPageHref && (!meetsPageHref || eventsPageHref !== meetsPageHref));
  const memberCount = Number(club.member_count ?? 0);
  const roleLabel = club.member_role ? ROLE_LABEL[club.member_role] ?? club.member_role : null;
  const hasSectionLinks = Boolean(
    showEventsLink ||
      meetsPageHref ||
      historyPageHref ||
      workoutsPageHref ||
      pbLeaderboardHref ||
      documentsPageHref ||
      (isStaff && coachPageHref)
  );

  return (
    <section aria-labelledby={titleId} className="surface-panel overflow-hidden">
      {club.cover_image_url ? (
        <img src={club.cover_image_url} alt="" className="h-28 w-full object-cover sm:h-40" />
      ) : null}

      <div className="p-4">
        <div className="flex items-start gap-3">
          <Avatar className="size-12 shrink-0 rounded-xl">
            <AvatarImage src={club.logo_url ?? undefined} alt="" className="object-cover" />
            <AvatarFallback className="rounded-xl bg-raised text-sm font-semibold">
              {club.name.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="font-display text-[28px] font-bold leading-tight text-foreground">
              {club.name}
            </h2>
            {club.tagline ? <p className="mt-0.5 text-sm text-muted-foreground">{club.tagline}</p> : null}
          </div>
          <div className="flex shrink-0 items-center">
            <Button variant="ghost" size="icon" aria-label="Membri" onClick={onOpenMembers}>
              <Users className="size-5" aria-hidden />
            </Button>
            {isStaff ? (
              <Button variant="ghost" size="icon" aria-label="Impostazioni del club" onClick={onOpenSettings}>
                <Settings className="size-5" aria-hidden />
              </Button>
            ) : null}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Chip className="tabular-nums">
            {memberCount === 1 ? "1 membro" : `${formatInteger(memberCount)} membri`}
          </Chip>
          <Chip>{VISIBILITY_LABEL[club.visibility] ?? club.visibility}</Chip>
          {roleLabel ? <Chip tone="action">{roleLabel}</Chip> : null}
          {club.website_url ? (
            <a
              href={club.website_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-7 items-center gap-1 text-sm font-semibold text-action-text underline-offset-2 hover:underline"
            >
              <ExternalLink className="size-4" aria-hidden />
              Sito del club
            </a>
          ) : null}
        </div>

        {hasSectionLinks ? (
          <nav aria-label="Sezioni del club" className="-mx-4 mt-4 overflow-x-auto px-4">
            <ul className="flex min-w-max gap-2">
              {showEventsLink ? (
                <SectionLink href={eventsPageHref!} icon={<Calendar aria-hidden />}>
                  Eventi
                </SectionLink>
              ) : null}
              {meetsPageHref ? (
                <SectionLink href={meetsPageHref} icon={<Trophy aria-hidden />}>
                  Gare
                  {/* A published or open meet: «in programma» is true of both. */}
                  {hasActiveMeet ? (
                    <>
                      <span aria-hidden className="size-2 rounded-full bg-primary" />
                      <span className="sr-only">, gara in programma</span>
                    </>
                  ) : null}
                </SectionLink>
              ) : null}
              {historyPageHref ? (
                <SectionLink href={historyPageHref} icon={<Database aria-hidden />}>
                  Storico
                </SectionLink>
              ) : null}
              {workoutsPageHref ? (
                <SectionLink href={workoutsPageHref} icon={<Dumbbell aria-hidden />}>
                  Allenamenti
                </SectionLink>
              ) : null}
              {pbLeaderboardHref ? (
                <SectionLink href={pbLeaderboardHref} icon={<Medal aria-hidden />}>
                  Record del club
                </SectionLink>
              ) : null}
              {documentsPageHref ? (
                <SectionLink href={documentsPageHref} icon={<FileText aria-hidden />}>
                  Documenti
                </SectionLink>
              ) : null}
              {isStaff && coachPageHref ? (
                <SectionLink href={coachPageHref} icon={<Shield aria-hidden />}>
                  Area coach
                </SectionLink>
              ) : null}
            </ul>
          </nav>
        ) : null}

        {!club.is_member ? (
          <Button className="mt-4 w-full sm:w-auto" onClick={onJoin} disabled={isJoining}>
            {isJoining ? "Richiesta..." : club.visibility === "public" ? "Unisciti" : "Richiedi accesso"}
          </Button>
        ) : club.member_role !== "owner" ? (
          <Button className="mt-3" variant="ghost" size="sm" onClick={onLeave} disabled={isLeaving}>
            {isLeaving ? "Uscita..." : "Lascia club"}
          </Button>
        ) : null}
      </div>
    </section>
  );
}
