/**
 * Club records: the members' best time on one event (stroke, distance, pool, race or training),
 * as a ranking (members only; the shell header carries the «Club» title and the back button).
 */

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import { Link, useRoute } from "wouter";
import { Dumbbell, Medal } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LoadError, LoadingSkeleton } from "@/components/corsia/LoadState";
import { Pager } from "@/components/corsia/Pager";
import { RankRow } from "@/components/corsia/RankRow";
import { ClubAccessState, ClubNotice } from "@/components/club/ClubPageState";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { usePaged } from "@/hooks/usePaged";
import { clubAccess } from "@/lib/club-access";
import { NO_VALUE, formatDayMonthYear, toFiniteNumber } from "@/lib/format";
import { rankEntries } from "@/lib/ranking";
import { formatSwimCentiseconds } from "@/lib/swimTime";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

const STROKES = [
  { value: "freestyle", label: "Stile libero" },
  { value: "backstroke", label: "Dorso" },
  { value: "breaststroke", label: "Rana" },
  { value: "butterfly", label: "Farfalla" },
  { value: "mixed", label: "Misti" },
] as const;

const DISTANCES_BY_STROKE: Record<string, number[]> = {
  freestyle: [50, 100, 200, 400, 800, 1500],
  backstroke: [50, 100, 200],
  breaststroke: [50, 100, 200],
  butterfly: [50, 100, 200],
  mixed: [200],
};

/** The server accepts a master category up to 32 characters. */
const MASTER_CATEGORY_MAX = 32;
const PAGE_SIZE = 20;
/** The category box asks the server once the typing pauses. */
const CATEGORY_DEBOUNCE_MS = 300;

export default function ClubPbLeaderboardPage() {
  const [match, params] = useRoute("/community/club/:clubId/pb");
  const clubId = Number(params?.clubId);
  const { user } = useAuth();
  const rankingTitleId = useId();
  const strokeId = useId();
  const distanceId = useId();
  const poolId = useId();
  const sourceId = useId();
  const categoryId = useId();
  const listRef = useRef<HTMLOListElement>(null);

  const [strokeType, setStrokeType] = useState<(typeof STROKES)[number]["value"]>("freestyle");
  const [distanceMeters, setDistanceMeters] = useState<number>(100);
  const [poolLengthMeters, setPoolLengthMeters] = useState<25 | 50>(25);
  const [source, setSource] = useState<"official" | "training">("training");
  const [masterCategory, setMasterCategory] = useState("");

  const distanceOptions = useMemo(() => DISTANCES_BY_STROKE[strokeType] ?? [100], [strokeType]);

  useEffect(() => {
    if (!distanceOptions.includes(distanceMeters)) {
      setDistanceMeters(distanceOptions[0]);
    }
  }, [distanceMeters, distanceOptions]);

  const clubQuery = trpc.community.clubs.get.useQuery(
    { clubId },
    { enabled: match && Number.isFinite(clubId) }
  );

  // Members only (the server answers FORBIDDEN otherwise): not even asked for before.
  const isMember = Boolean((clubQuery.data as any)?.is_member);
  const category = useDebouncedValue(masterCategory.trim(), CATEGORY_DEBOUNCE_MS);
  const leaderboardQuery = trpc.records.clubLeaderboard.useQuery(
    {
      clubId,
      strokeType,
      distanceMeters,
      poolLengthMeters,
      source,
      ...(category.length > 0 ? { masterCategory: category } : {}),
      limit: 80,
    },
    {
      enabled: match && Number.isFinite(clubId) && clubId > 0 && isMember,
      // A new filter keeps the current ranking on screen (marked busy) instead of a skeleton.
      placeholderData: keepPreviousData,
    }
  );

  const rows = useMemo(
    () => ((leaderboardQuery.data as any)?.leaderboard as Array<any> | undefined) ?? [],
    [leaderboardQuery.data]
  );
  // Fastest first from the server: equal times share a position, a row without a time has none.
  const ranked = useMemo(() => rankEntries(rows, (row) => toFiniteNumber(row.timeCs) ?? 0), [rows]);
  const paging = usePaged(ranked, PAGE_SIZE, [strokeType, distanceMeters, poolLengthMeters, source, category]);

  if (!match || !Number.isFinite(clubId) || clubId <= 0) return null;

  const access = clubAccess(clubQuery);
  if (access !== "member") {
    return (
      <AppLayout>
        <ClubAccessState
          access={access}
          clubId={clubId}
          loadingLabel="Caricamento dei record del club…"
          notMemberText="Iscriviti al club per vedere i suoi record."
          onRetry={() => void clubQuery.refetch()}
        />
      </AppLayout>
    );
  }

  const club = clubQuery.data as any;
  const selectedStrokeLabel = STROKES.find((entry) => entry.value === strokeType)?.label ?? strokeType;
  const leaderboardErrorCode = leaderboardQuery.error?.data?.code;
  const leaderboardFailed = !leaderboardQuery.data && leaderboardQuery.isError;
  // The previous filter's ranking while the new one loads.
  const showingPrevious = leaderboardQuery.isPlaceholderData;
  const profileHref = (userId: unknown) =>
    `/u/${userId}?from=${encodeURIComponent(`/community/club/${clubId}/pb`)}`;

  let ranking: ReactNode;
  // An empty previous ranking is no answer for the new filter: a skeleton, not «Nessun record».
  if (leaderboardQuery.isPending || (showingPrevious && rows.length === 0)) {
    ranking = <LoadingSkeleton label="Caricamento della classifica…" count={5} className="mt-3 space-y-2" />;
  } else if (leaderboardFailed && leaderboardErrorCode === "FORBIDDEN") {
    ranking = (
      <ClubNotice className="mt-3" backHref={`/community/club/${clubId}`}>
        Iscriviti al club per vedere i suoi record.
      </ClubNotice>
    );
  } else if (leaderboardFailed && leaderboardErrorCode !== "NOT_FOUND") {
    ranking = <LoadError className="mt-3" onRetry={() => void leaderboardQuery.refetch()} />;
  } else if (leaderboardFailed) {
    ranking = (
      <ClubNotice className="mt-3" backHref="/home/community" backLabel="Torna alla community">
        Club non trovato.
      </ClubNotice>
    );
  } else if (rows.length === 0) {
    ranking = (
      <div className="surface-panel mt-3 flex flex-col items-center gap-2 p-6 text-center">
        <Medal className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-sm text-muted-foreground">Nessun record per questi filtri.</p>
      </div>
    );
  } else {
    ranking = (
      <>
        {/* Each `value` keeps the list position equal to the visible rank; no value without one. */}
        <ol
          ref={listRef}
          aria-labelledby={rankingTitleId}
          aria-busy={showingPrevious || undefined}
          className={cn("mt-3 scroll-mt-20 space-y-2", showingPrevious && "opacity-60")}
        >
          {paging.pageItems.map(({ entry: row, rank }, index) => {
            const subtitle = [row.masterCategory || null, formatDayMonthYear(row.achievedAt)]
              .filter((part) => part && part !== NO_VALUE)
              .join(" · ");
            return (
              <li key={`${row.userId}-${paging.offset + index}`} value={rank ?? undefined}>
                <RankRow
                  rank={rank}
                  name={String(row.displayName || row.username || "Nuotatore")}
                  avatarUrl={row.avatarUrl}
                  subtitle={subtitle || undefined}
                  value={formatSwimCentiseconds(row.timeCs)}
                  href={profileHref(row.userId)}
                  isCurrentUser={user != null && Number(user.id) === Number(row.userId)}
                />
              </li>
            );
          })}
        </ol>
        <Pager
          className="mt-3"
          page={paging.page}
          totalPages={paging.totalPages}
          onChange={paging.setPage}
          listRef={listRef}
          label="Pagine della classifica"
        />
      </>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-[28px] font-bold leading-none">Record del club</h2>
            <p className="mt-1 text-sm text-muted-foreground">{club.name}</p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/community/club/${clubId}/workouts`}>
              <Dumbbell aria-hidden />
              Allenamenti del club
            </Link>
          </Button>
        </div>

        <section aria-label="Filtri" className="surface-panel grid grid-cols-2 gap-3 p-4 md:grid-cols-5">
          <div className="space-y-1">
            <Label htmlFor={strokeId}>Stile</Label>
            <Select value={strokeType} onValueChange={(value) => setStrokeType(value as typeof strokeType)}>
              <SelectTrigger id={strokeId} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STROKES.map((stroke) => (
                  <SelectItem key={stroke.value} value={stroke.value}>
                    {stroke.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label htmlFor={distanceId}>Distanza</Label>
            <Select value={String(distanceMeters)} onValueChange={(value) => setDistanceMeters(Number(value))}>
              <SelectTrigger id={distanceId} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {distanceOptions.map((distance) => (
                  <SelectItem key={distance} value={String(distance)}>
                    {distance} m
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label htmlFor={poolId}>Vasca</Label>
            <Select
              value={String(poolLengthMeters)}
              onValueChange={(value) => setPoolLengthMeters(Number(value) as 25 | 50)}
            >
              <SelectTrigger id={poolId} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="25">25 m</SelectItem>
                <SelectItem value="50">50 m</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label htmlFor={sourceId}>Fonte</Label>
            <Select value={source} onValueChange={(value) => setSource(value as "official" | "training")}>
              <SelectTrigger id={sourceId} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="training">Allenamento</SelectItem>
                <SelectItem value="official">Gara ufficiale</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="col-span-2 space-y-1 md:col-span-1">
            <Label htmlFor={categoryId}>Categoria master</Label>
            <Input
              id={categoryId}
              placeholder="Facoltativa"
              maxLength={MASTER_CATEGORY_MAX}
              value={masterCategory}
              onChange={(event) => setMasterCategory(event.target.value)}
            />
          </div>
        </section>

        <section aria-labelledby={rankingTitleId}>
          <h3 id={rankingTitleId} className="text-[17px] font-bold">
            {selectedStrokeLabel} {distanceMeters} m · vasca {poolLengthMeters} m
          </h3>
          <p className="text-sm text-muted-foreground">
            {source === "official" ? "Tempi di gara" : "Tempi di allenamento"}
            {category ? ` · categoria ${category}` : ""}
          </p>
          {ranking}
        </section>
      </div>
    </AppLayout>
  );
}
