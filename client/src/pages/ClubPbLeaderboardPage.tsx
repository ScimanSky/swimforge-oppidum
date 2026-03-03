import { useEffect, useMemo, useState } from "react";
import { Link, useRoute } from "wouter";
import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { Surface, SurfaceContent } from "@/components/ui/surface";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Medal, Trophy } from "lucide-react";
import { formatSwimCentiseconds } from "@/lib/swimTime";

const STROKES = [
  { value: "freestyle", label: "Stile Libero" },
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

function rankTone(rank: number) {
  if (rank === 1) return "text-amber-300";
  if (rank === 2) return "text-slate-200";
  if (rank === 3) return "text-orange-300";
  return "text-muted-foreground";
}

function formatDate(value?: string | Date | null) {
  if (!value) return "--";
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return "--";
  return parsed.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function ClubPbLeaderboardPage() {
  const [match, params] = useRoute("/community/club/:clubId/pb");
  const clubId = Number(params?.clubId);

  const [strokeType, setStrokeType] = useState<(typeof STROKES)[number]["value"]>("freestyle");
  const [distanceMeters, setDistanceMeters] = useState<number>(100);
  const [poolLengthMeters, setPoolLengthMeters] = useState<25 | 50>(50);
  const [source, setSource] = useState<"official" | "training">("official");
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

  const leaderboardQuery = trpc.records.clubLeaderboard.useQuery(
    {
      clubId,
      strokeType,
      distanceMeters,
      poolLengthMeters,
      source,
      ...(masterCategory.trim().length > 0 ? { masterCategory: masterCategory.trim() } : {}),
      limit: 80,
    },
    { enabled: match && Number.isFinite(clubId) && clubId > 0 }
  );

  if (!match || !Number.isFinite(clubId) || clubId <= 0) return null;

  const club = clubQuery.data as any;
  const rows = ((leaderboardQuery.data as any)?.leaderboard as Array<any> | undefined) ?? [];
  const selectedStrokeLabel = STROKES.find((entry) => entry.value === strokeType)?.label ?? strokeType;

  return (
    <AppLayout>
      <div className="compact-shell mx-auto max-w-6xl space-y-4 px-3 pb-24 sm:px-4">
        <section className="surface-panel p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <Link href={`/community/club/${clubId}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-4 w-4" /> Torna al club
              </Link>
              <h1 className="mt-1 text-2xl font-display font-bold">Club PB Leaderboard</h1>
              <p className="text-sm text-muted-foreground">{club?.name ?? "Club"}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge variant="outline">{selectedStrokeLabel} {distanceMeters}m</Badge>
                <Badge variant="outline">Vasca {poolLengthMeters}m</Badge>
                <Badge variant="outline">{source === "official" ? "Fonte: Gara" : "Fonte: Allenamento"}</Badge>
              </div>
            </div>
            <Link href={`/community/club/${clubId}/workouts`} className="w-full sm:w-auto">
              <Button className="w-full sm:w-auto" variant="outline-neon" size="sm">
                Vai ai workout club
              </Button>
            </Link>
          </div>
        </section>

        <section className="surface-panel p-4 space-y-3">
          <p className="text-xs font-display uppercase tracking-wide text-muted-foreground">Filtri leaderboard</p>
          <div className="grid gap-2 md:grid-cols-5">
            <Select value={strokeType} onValueChange={(value) => setStrokeType(value as typeof strokeType)}>
              <SelectTrigger>
                <SelectValue placeholder="Stile" />
              </SelectTrigger>
              <SelectContent>
                {STROKES.map((stroke) => (
                  <SelectItem key={stroke.value} value={stroke.value}>
                    {stroke.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={String(distanceMeters)} onValueChange={(value) => setDistanceMeters(Number(value))}>
              <SelectTrigger>
                <SelectValue placeholder="Distanza" />
              </SelectTrigger>
              <SelectContent>
                {distanceOptions.map((distance) => (
                  <SelectItem key={distance} value={String(distance)}>
                    {distance}m
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={String(poolLengthMeters)} onValueChange={(value) => setPoolLengthMeters(Number(value) as 25 | 50)}>
              <SelectTrigger>
                <SelectValue placeholder="Vasca" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="25">25m</SelectItem>
                <SelectItem value="50">50m</SelectItem>
              </SelectContent>
            </Select>

            <Select value={source} onValueChange={(value) => setSource(value as "official" | "training")}>
              <SelectTrigger>
                <SelectValue placeholder="Fonte" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="official">Gara ufficiale</SelectItem>
                <SelectItem value="training">Allenamento</SelectItem>
              </SelectContent>
            </Select>

            <Input
              placeholder="Categoria master (opz.)"
              value={masterCategory}
              onChange={(event) => setMasterCategory(event.target.value)}
            />
          </div>
        </section>

        <Surface className="bg-card border-border">
          <SurfaceContent className="p-0">
            {clubQuery.isLoading || leaderboardQuery.isLoading ? (
              <div className="p-6 text-sm text-muted-foreground">Caricamento leaderboard...</div>
            ) : rows.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">Nessun personal best disponibile per i filtri selezionati.</div>
            ) : (
              <div className="divide-y divide-border/60">
                {rows.map((row) => (
                  <div key={`${row.rank}-${row.userId}`} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className={`flex w-8 items-center justify-center text-sm font-bold ${rankTone(Number(row.rank))}`}>
                        {Number(row.rank) <= 3 ? <Trophy className="h-4 w-4" /> : <Medal className="h-4 w-4" />}
                      </div>
                      <div className="min-w-0">
                        <Link
                          href={`/u/${row.userId}?from=${encodeURIComponent(`/community/club/${clubId}/pb`)}`}
                          className="truncate text-sm font-semibold text-foreground hover:text-primary"
                        >
                          {String(row.displayName ?? `User ${row.userId}`)}
                        </Link>
                        <div className="text-xs text-muted-foreground">
                          {row.masterCategory ? `${row.masterCategory} • ` : ""}{formatDate(row.achievedAt)}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-display text-lg font-bold text-primary">{formatSwimCentiseconds(row.timeCs)}</p>
                      <p className="text-[11px] text-muted-foreground">PB</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SurfaceContent>
        </Surface>
      </div>
    </AppLayout>
  );
}
