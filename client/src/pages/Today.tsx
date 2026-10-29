import { useMemo, type ReactNode } from "react";
import { Link } from "wouter";
import {
  Link2,
  RefreshCw,
  Sparkles,
  SquarePen,
  Target,
  Waves,
  type LucideIcon,
} from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { ActivityCard, type ActivityCardData } from "@/components/corsia/ActivityCard";
import { LevelStrip } from "@/components/corsia/LevelCard";
import { WeekCard } from "@/components/corsia/WeekCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentDay } from "@/hooks/useCurrentDay";
import { GARMIN_CONNECT_PATH, useGarminQuickSync } from "@/hooks/useGarminQuickSync";
import { formatWeekdayDayMonth } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { summarizeWeek } from "@/lib/week-summary";

const timeOf = (value: string | Date) => {
  const time = (value instanceof Date ? value : new Date(value)).getTime();
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
};

const sectionTitle = "text-[17px] font-bold";
const actionClass =
  "surface-panel flex h-20 w-full items-center gap-3 px-4 text-left text-[15px] font-semibold transition-colors hover:border-action-text/40 aria-disabled:opacity-60";

function QuickAction({
  icon,
  label,
  href,
  onClick,
  disabled,
}: {
  icon: LucideIcon;
  label: string;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const Icon = icon;
  const content = (
    <>
      <Icon className="size-6 shrink-0 text-action-text" aria-hidden />
      <span className="min-w-0">{label}</span>
    </>
  );
  if (href)
    return (
      <Link href={href} className={actionClass}>
        {content}
      </Link>
    );
  // aria-disabled, not disabled: the button keeps the keyboard focus while it is busy.
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      aria-disabled={disabled || undefined}
      className={actionClass}
    >
      {content}
    </button>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className={sectionTitle}>{title}</h2>
      {children}
    </section>
  );
}

/** Oggi: the native home. Week, last swim, level, quick actions. */
export default function Today() {
  const activitiesQuery = trpc.activities.list.useQuery({
    limit: 50,
    offset: 0,
    source: "all",
  });
  const profileQuery = trpc.profile.get.useQuery(undefined, { staleTime: 120_000 });
  const insightsQuery = trpc.activityInsights.list.useQuery({ limit: 1, offset: 0 });
  const garmin = useGarminQuickSync({ watchStatus: true });

  const activities = activitiesQuery.data;
  // Kept mounted across days (app resumed the next morning): `now` changes with the day.
  const { now } = useCurrentDay();
  const week = useMemo(() => summarizeWeek(activities ?? [], now), [activities, now]);
  const lastSwim = useMemo<ActivityCardData | null>(() => {
    if (!activities?.length) return null;
    return [...activities].sort((a, b) => timeOf(b.activityDate) - timeOf(a.activityDate))[0];
  }, [activities]);

  // Raw SQL row (snake_case): only the coach summary of that same swim.
  const insight = insightsQuery.data?.[0] as
    | { activity_id?: unknown; summary?: unknown }
    | undefined;
  const coachSummary =
    lastSwim &&
    insight &&
    Number(insight.activity_id) === lastSwim.id &&
    typeof insight.summary === "string" &&
    insight.summary.trim()
      ? insight.summary.trim()
      : null;

  const profile = profileQuery.data;
  const notConnected = garmin.connected === false;
  const showsEmptyState = !activitiesQuery.isLoading && !activitiesQuery.isError && !lastSwim;
  const syncLabel = garmin.isPending ? "Sincronizzazione…" : "Sincronizza Garmin";
  const startSync = () => {
    if (garmin.isPending) return;
    void garmin.sync();
  };
  // The empty state already offers the Garmin action: the tile becomes «Attività».
  const syncAction = showsEmptyState ? (
    <QuickAction icon={Waves} label="Attività" href="/track" />
  ) : notConnected ? (
    <QuickAction icon={Link2} label="Collega Garmin" href={GARMIN_CONNECT_PATH} />
  ) : (
    <QuickAction
      icon={RefreshCw}
      label={syncLabel}
      onClick={startSync}
      disabled={garmin.isPending}
    />
  );

  const retry = () => {
    void activitiesQuery.refetch();
    void profileQuery.refetch();
  };

  let main: ReactNode;
  if (activitiesQuery.isLoading) {
    main = (
      <div className="space-y-6" role="status">
        <span className="sr-only">Caricamento…</span>
        <Skeleton className="h-[172px] rounded-2xl" />
        <div className="space-y-3">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-[148px] rounded-2xl" />
        </div>
      </div>
    );
  } else if (activitiesQuery.isError) {
    main = (
      <div className="surface-panel p-5" role="alert">
        <p className="font-semibold">Non riesco a caricare i dati</p>
        <Button type="button" variant="outline" className="mt-4" onClick={retry}>
          Riprova
        </Button>
      </div>
    );
  } else if (!lastSwim) {
    main = (
      <div className="surface-panel p-5">
        <h2 className={sectionTitle}>Ancora nessuna nuotata</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {notConnected
            ? "Collega Garmin per vedere qui le tue sessioni."
            : "Sincronizza Garmin per vedere qui le tue sessioni."}
        </p>
        {notConnected ? (
          <Button asChild className="mt-4">
            <Link href={GARMIN_CONNECT_PATH}>Collega Garmin</Link>
          </Button>
        ) : (
          <Button
            type="button"
            className="mt-4 aria-disabled:opacity-60"
            onClick={startSync}
            aria-disabled={garmin.isPending || undefined}
          >
            <RefreshCw aria-hidden />
            {syncLabel}
          </Button>
        )}
      </div>
    );
  } else {
    main = (
      <>
        <WeekCard summary={week} />
        <Section title="Ultima nuotata">
          <ActivityCard activity={lastSwim} />
          {coachSummary ? (
            <p className="flex items-start gap-2 text-sm text-muted-foreground">
              <Sparkles className="mt-0.5 size-4 shrink-0 text-action-text" aria-hidden />
              <span className="line-clamp-2">
                <span className="sr-only">Coach AI: </span>
                {coachSummary}
              </span>
            </p>
          ) : null}
        </Section>
      </>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-2xl space-y-6">
        <p className="text-sm text-muted-foreground">{formatWeekdayDayMonth(now)}</p>
        {main}
        {profile && typeof profile.level === "number" ? (
          <LevelStrip
            level={profile.level}
            totalXp={profile.totalXp ?? 0}
            currentLevelXp={profile.currentLevelXp ?? 0}
            nextLevelXp={profile.nextLevelXp ?? null}
            xpToNextLevel={profile.xpToNextLevel ?? 0}
          />
        ) : null}
        <Section title="Azioni rapide">
          <div className="grid grid-cols-2 gap-3">
            {syncAction}
            <QuickAction
              icon={SquarePen}
              label="Nuovo post"
              onClick={() =>
                window.dispatchEvent(new CustomEvent("swimforge:open-create-post"))
              }
            />
            <QuickAction icon={Sparkles} label="Coach AI" href="/coach" />
            <QuickAction icon={Target} label="Obiettivi" href="/goals" />
          </div>
        </Section>
      </div>
    </AppLayout>
  );
}
