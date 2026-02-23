import { useEffect, useMemo, useState } from "react";
import { Link, useRoute } from "wouter";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import HistoryMetricCircle from "@/components/club/HistoryMetricCircle";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Database, Users } from "lucide-react";

function formatDate(value: unknown): string {
  if (!value) return "-";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatTime(raw: unknown): string {
  const value = String(raw ?? "").trim();
  return value || "-";
}

function formatPoints(value: unknown): string {
  const num = Number(value ?? NaN);
  if (!Number.isFinite(num)) return "-";
  return num.toFixed(2);
}

export default function ClubHistoryAthletesPage() {
  const [match, params] = useRoute("/community/club/:clubId/history/athletes");
  const clubId = Number(params?.clubId);

  const [search, setSearch] = useState("");
  const [selectedSeason, setSelectedSeason] = useState<string>("all");
  const [selectedAthleteSlug, setSelectedAthleteSlug] = useState<string>("");

  const seasonNumber = selectedSeason === "all" ? undefined : Number(selectedSeason);
  const searchValue = search.trim() || undefined;

  const clubQuery = trpc.community.clubs.get.useQuery(
    { clubId },
    { enabled: match && Number.isFinite(clubId) },
  );

  const configQuery = trpc.community.clubs.history.config.get.useQuery(
    { clubId },
    { enabled: match && Number.isFinite(clubId) },
  );

  const athletesQuery = trpc.community.clubs.history.athletes.list.useQuery(
    {
      clubId,
      search: searchValue,
      season: seasonNumber,
      limit: 80,
      offset: 0,
    },
    {
      enabled: match && Number.isFinite(clubId) && Boolean(configQuery.data?.enabled),
    },
  );

  const athleteDetailQuery = trpc.community.clubs.history.athletes.get.useQuery(
    { clubId, athleteSlug: selectedAthleteSlug },
    {
      enabled:
        match
        && Number.isFinite(clubId)
        && Boolean(configQuery.data?.enabled)
        && Boolean(selectedAthleteSlug),
    },
  );

  const club = clubQuery.data as any;
  const athletes = ((athletesQuery.data as any)?.items as any[]) ?? [];
  const seasons = useMemo(
    () => (((athletesQuery.data as any)?.seasons as string[]) ?? []).filter(Boolean),
    [athletesQuery.data],
  );

  useEffect(() => {
    if (athletes.length === 0) {
      setSelectedAthleteSlug("");
      return;
    }
    const stillExists = athletes.some((item) => item.athlete_slug === selectedAthleteSlug);
    if (!stillExists) {
      setSelectedAthleteSlug(String(athletes[0]?.athlete_slug ?? ""));
    }
  }, [athletes, selectedAthleteSlug]);

  if (!match || !Number.isFinite(clubId)) return null;

  if (clubQuery.isLoading || configQuery.isLoading) {
    return (
      <AppLayout>
        <div className="container py-6">
          <div className="surface-panel p-6 text-center text-muted-foreground">Caricamento storico atleti...</div>
        </div>
      </AppLayout>
    );
  }

  if (!configQuery.data?.enabled) {
    return (
      <AppLayout>
        <div className="container py-6 space-y-4">
          <Link href={`/community/club/${clubId}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Torna al club
          </Link>
          <div className="surface-panel p-6 text-center space-y-2">
            <Database className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Storico dati non abilitato per questo club.</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  const detail = athleteDetailQuery.data as any;
  const detailResults = (detail?.results as any[]) ?? [];
  const totalAthletes = Number((athletesQuery.data as any)?.total ?? athletes.length);

  const jumpToDetail = () => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(max-width: 1023px)").matches) {
      window.requestAnimationFrame(() => {
        document.getElementById("history-athlete-detail")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    }
  };

  const jumpToList = () => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(max-width: 1023px)").matches) {
      window.requestAnimationFrame(() => {
        document.getElementById("history-athlete-list")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    }
  };

  return (
    <AppLayout>
      <div className="compact-shell mx-auto max-w-6xl space-y-4 px-3 pb-24 sm:px-4">
        <section className="surface-panel relative overflow-hidden p-4 sm:p-5">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.16),transparent_52%)]" />
          <div className="relative flex flex-wrap items-start justify-between gap-3">
            <div>
              <Link href={`/community/club/${clubId}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-4 w-4" /> Torna al club
              </Link>
              <h1 className="mt-1 text-2xl font-display font-bold">Storico Atleti</h1>
              <p className="text-sm text-muted-foreground">{club?.name ?? "Club"}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge variant="outline">Fonte Oppidum</Badge>
                <Badge variant="outline">{totalAthletes} atleti</Badge>
              </div>
            </div>
            <Link href={`/community/club/${clubId}/history/meets`} className="w-full sm:w-auto">
              <Button className="w-full sm:w-auto" variant="outline-neon" size="sm">Vai a Storico Meeting</Button>
            </Link>
          </div>
        </section>

        <section className="surface-panel p-4 space-y-3">
          <p className="text-xs font-display uppercase tracking-wide text-muted-foreground">Filtri</p>
          <div className="grid gap-2 md:grid-cols-[1fr_220px]">
            <Input
              placeholder="Cerca atleta..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Select value={selectedSeason} onValueChange={setSelectedSeason}>
              <SelectTrigger>
                <SelectValue placeholder="Stagione" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutte le stagioni</SelectItem>
                {seasons.map((season) => (
                  <SelectItem key={season} value={season}>{season}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-[minmax(320px,0.9fr)_minmax(0,1.4fr)]">
          <section id="history-athlete-list" className="surface-panel scroll-mt-24 p-3 sm:scroll-mt-32 sm:p-4 space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" /> Atleti</span>
              <span>{(athletesQuery.data as any)?.total ?? athletes.length}</span>
            </div>
            <p className="text-[11px] text-muted-foreground lg:hidden">Tocca un atleta per aprire il dettaglio.</p>
            {athletesQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Caricamento elenco...</p>
            ) : athletes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nessun atleta trovato.</p>
            ) : (
              athletes.map((athlete) => {
                const active = selectedAthleteSlug === athlete.athlete_slug;
                return (
                  <button
                    key={athlete.id}
                    type="button"
                    onClick={() => {
                      setSelectedAthleteSlug(String(athlete.athlete_slug));
                      jumpToDetail();
                    }}
                    className={`w-full rounded-xl border px-3 py-2 text-left transition-colors ${
                      active
                        ? "border-primary/60 bg-primary/12 shadow-[0_0_0_1px_rgba(34,211,238,0.22)]"
                        : "border-border/60 bg-card/25 hover:bg-card/45"
                    }`}
                  >
                    <p className="text-sm font-semibold truncate">{athlete.athlete_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {Number(athlete.results_count ?? 0)} risultati • {Number(athlete.meets_count ?? 0)} meeting
                    </p>
                  </button>
                );
              })
            )}
          </section>

          <section id="history-athlete-detail" className="surface-panel scroll-mt-24 p-3 sm:scroll-mt-32 sm:p-4 space-y-3">
            {!selectedAthleteSlug ? (
              <p className="text-sm text-muted-foreground">Seleziona un atleta.</p>
            ) : athleteDetailQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Caricamento dettaglio atleta...</p>
            ) : !detail?.athlete ? (
              <p className="text-sm text-muted-foreground">Dettaglio atleta non disponibile.</p>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-semibold">{detail.athlete.athleteName}</h2>
                    <p className="text-xs text-muted-foreground">Aggiornato: {formatDate(detail.athlete.updatedAt)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {detail.athlete.linkedUserId ? <Badge variant="outline">Utente collegato</Badge> : null}
                    <Button type="button" variant="outline-neon" size="sm" className="lg:hidden" onClick={jumpToList}>
                      Torna all'elenco
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  {detailResults.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nessun risultato storico disponibile.</p>
                  ) : (
                    detailResults.map((row) => {
                      const hasRecord = Boolean(String(row.record_raw ?? "").trim());
                      return (
                      <div
                        key={row.id}
                        className={`relative overflow-hidden rounded-xl border bg-card/30 px-3 py-2 ${
                          hasRecord
                            ? "border-amber-300/70 shadow-[0_0_0_1px_rgba(252,211,77,0.35),0_0_22px_rgba(251,191,36,0.22)]"
                            : "border-border/60"
                        }`}
                      >
                        <img
                          src="/images/theme-v3/landing-tour-poster.png"
                          alt=""
                          aria-hidden="true"
                          className="pointer-events-none absolute inset-0 h-full w-full object-cover object-center opacity-[0.2] saturate-[0.9] contrast-[1.03]"
                          loading="lazy"
                        />
                        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(102deg,color-mix(in_oklch,var(--background)_90%,transparent)_0%,color-mix(in_oklch,var(--background)_74%,transparent)_44%,color-mix(in_oklch,var(--background)_56%,transparent)_100%)]" />
                        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_14%_10%,color-mix(in_oklch,var(--electric-cyan)_14%,transparent),transparent_40%),radial-gradient(circle_at_88%_12%,color-mix(in_oklch,var(--electric-lime)_12%,transparent),transparent_42%)]" />
                        <div className="relative z-10">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold break-words">{row.meet_name}</p>
                          </div>
                          <p className="text-xs text-muted-foreground break-words">
                            {formatDate(row.meet_date)} • {row.event_label}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <HistoryMetricCircle
                              label="Tempo"
                              value={formatTime(row.final_time_raw)}
                            />
                            <HistoryMetricCircle
                              label="Record"
                              value={hasRecord ? String(row.record_raw) : "-"}
                              highlight={hasRecord}
                            />
                            <HistoryMetricCircle
                              label="Punti"
                              value={formatPoints(row.points)}
                            />
                          </div>
                          {row.record_raw || row.notes ? (
                            <p className="mt-1 text-xs text-muted-foreground break-words">
                              {row.record_raw ? `Record: ${row.record_raw}` : ""}
                              {row.record_raw && row.notes ? " • " : ""}
                              {row.notes ? `Note: ${row.notes}` : ""}
                            </p>
                          ) : null}
                        </div>
                      </div>
                      );
                    })
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </AppLayout>
  );
}
