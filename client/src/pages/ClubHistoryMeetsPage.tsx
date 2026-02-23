import { useEffect, useMemo, useState } from "react";
import { Link, useRoute } from "wouter";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import HistoryMetricCircle from "@/components/club/HistoryMetricCircle";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Database, Trophy } from "lucide-react";

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

function formatPoints(value: unknown): string {
  const num = Number(value ?? NaN);
  if (!Number.isFinite(num)) return "-";
  return num.toFixed(2);
}

function formatTime(raw: unknown): string {
  const value = String(raw ?? "").trim();
  return value || "-";
}

export default function ClubHistoryMeetsPage() {
  const [match, params] = useRoute("/community/club/:clubId/history/meets");
  const clubId = Number(params?.clubId);

  const [search, setSearch] = useState("");
  const [selectedSeason, setSelectedSeason] = useState<string>("all");
  const [selectedMeetSlug, setSelectedMeetSlug] = useState<string>("");
  const [searchAthlete, setSearchAthlete] = useState("");
  const [eventFilter, setEventFilter] = useState("");
  const [sort, setSort] = useState<"points_desc" | "time_asc" | "time_desc" | "athlete_asc">("points_desc");

  const seasonNumber = selectedSeason === "all" ? undefined : Number(selectedSeason);

  const clubQuery = trpc.community.clubs.get.useQuery(
    { clubId },
    { enabled: match && Number.isFinite(clubId) },
  );

  const configQuery = trpc.community.clubs.history.config.get.useQuery(
    { clubId },
    { enabled: match && Number.isFinite(clubId) },
  );

  const meetsQuery = trpc.community.clubs.history.meets.list.useQuery(
    {
      clubId,
      season: seasonNumber,
      search: search.trim() || undefined,
      limit: 80,
      offset: 0,
    },
    {
      enabled: match && Number.isFinite(clubId) && Boolean(configQuery.data?.enabled),
    },
  );

  const meetDetailQuery = trpc.community.clubs.history.meets.get.useQuery(
    { clubId, meetSlug: selectedMeetSlug },
    {
      enabled:
        match
        && Number.isFinite(clubId)
        && Boolean(configQuery.data?.enabled)
        && Boolean(selectedMeetSlug),
    },
  );

  const resultsQuery = trpc.community.clubs.history.meets.results.useQuery(
    {
      clubId,
      meetSlug: selectedMeetSlug,
      searchAthlete: searchAthlete.trim() || undefined,
      eventLabel: eventFilter.trim() || undefined,
      sort,
    },
    {
      enabled:
        match
        && Number.isFinite(clubId)
        && Boolean(configQuery.data?.enabled)
        && Boolean(selectedMeetSlug),
    },
  );

  const meets = ((meetsQuery.data as any)?.items as any[]) ?? [];
  const seasons = useMemo(
    () => (((meetsQuery.data as any)?.seasons as string[]) ?? []).filter(Boolean),
    [meetsQuery.data],
  );

  useEffect(() => {
    if (meets.length === 0) {
      setSelectedMeetSlug("");
      return;
    }
    const stillExists = meets.some((item) => item.meet_slug === selectedMeetSlug);
    if (!stillExists) {
      setSelectedMeetSlug(String(meets[0]?.meet_slug ?? ""));
    }
  }, [meets, selectedMeetSlug]);

  if (!match || !Number.isFinite(clubId)) return null;

  if (clubQuery.isLoading || configQuery.isLoading) {
    return (
      <AppLayout>
        <div className="container py-6">
          <div className="surface-panel p-6 text-center text-muted-foreground">Caricamento storico meeting...</div>
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

  const meetDetail = meetDetailQuery.data as any;
  const results = (resultsQuery.data as any[]) ?? [];
  const totalMeets = Number((meetsQuery.data as any)?.total ?? meets.length);
  const meetSummary = useMemo(() => {
    let recordCount = 0;
    for (const row of results) {
      if (String(row?.record_raw ?? "").trim()) recordCount += 1;
    }
    return {
      resultsCount: Number(meetDetail?.stats?.resultsCount ?? results.length),
      athletesCount: Number(meetDetail?.stats?.athletesCount ?? 0),
      recordCount,
    };
  }, [meetDetail, results]);

  const jumpToDetail = () => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(max-width: 1023px)").matches) {
      window.requestAnimationFrame(() => {
        document.getElementById("history-meet-detail")?.scrollIntoView({
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
        document.getElementById("history-meet-list")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    }
  };

  return (
    <AppLayout>
      <div className="compact-shell mx-auto max-w-7xl space-y-4 px-3 pb-24 sm:px-4">
        <section className="surface-panel relative overflow-hidden p-4 sm:p-5">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.16),transparent_52%)]" />
          <div className="relative flex flex-wrap items-start justify-between gap-3">
            <div>
              <Link href={`/community/club/${clubId}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-4 w-4" /> Torna al club
              </Link>
              <h1 className="mt-1 text-2xl font-display font-bold">Storico Meeting</h1>
              <p className="text-sm text-muted-foreground">{(clubQuery.data as any)?.name ?? "Club"}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge variant="outline">Fonte Oppidum</Badge>
                <Badge variant="outline">{totalMeets} meeting</Badge>
              </div>
            </div>
            <Link href={`/community/club/${clubId}/history/athletes`} className="w-full sm:w-auto">
              <Button className="w-full sm:w-auto" variant="outline-neon" size="sm">Vai a Storico Atleti</Button>
            </Link>
          </div>
        </section>

        <section className="surface-panel p-4 space-y-3">
          <p className="text-xs font-display uppercase tracking-wide text-muted-foreground">Filtri</p>
          <div className="grid gap-2 md:grid-cols-[1fr_220px]">
            <Input
              placeholder="Cerca meeting..."
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

        <div className="grid gap-4 xl:grid-cols-[minmax(320px,0.88fr)_minmax(0,1.48fr)]">
          <section id="history-meet-list" className="surface-panel scroll-mt-24 p-3 sm:scroll-mt-32 sm:p-4 space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1"><Trophy className="h-3.5 w-3.5" /> Meeting</span>
              <span>{(meetsQuery.data as any)?.total ?? meets.length}</span>
            </div>
            <p className="text-[11px] text-muted-foreground xl:hidden">Tocca un meeting per aprire i risultati.</p>
            {meetsQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Caricamento meeting...</p>
            ) : meets.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nessun meeting disponibile.</p>
            ) : (
              meets.map((meet) => {
                const active = selectedMeetSlug === meet.meet_slug;
                return (
                  <button
                    key={meet.id}
                    type="button"
                    onClick={() => {
                      setSelectedMeetSlug(String(meet.meet_slug));
                      jumpToDetail();
                    }}
                    className={`group relative w-full overflow-hidden rounded-2xl border text-left transition-all ${
                      active
                        ? "border-primary/70 shadow-[0_0_0_1px_rgba(34,211,238,0.35),0_0_20px_rgba(34,211,238,0.18)]"
                        : "border-border/60 hover:border-primary/45"
                    }`}
                  >
                    <img
                      src="/images/theme-v3/landing-tour-poster.png"
                      alt=""
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 h-full w-full object-cover object-center opacity-[0.18]"
                      loading="lazy"
                    />
                    <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(106deg,rgba(2,10,23,0.86)_0%,rgba(5,20,35,0.64)_45%,rgba(2,10,23,0.56)_100%)]" />
                    <div className="relative z-10 flex flex-wrap items-center justify-between gap-2 p-2.5 sm:p-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{meet.meet_name}</p>
                        <p className="truncate text-xs text-muted-foreground">{formatDate(meet.meet_date)}</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <HistoryMetricCircle
                          size="sm"
                          tone="cyan"
                          label="Ris"
                          value={String(Number(meet.results_count ?? 0))}
                        />
                        <HistoryMetricCircle
                          size="sm"
                          tone="lime"
                          label="Atl"
                          value={String(Number(meet.athletes_count ?? 0))}
                        />
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </section>

          <section id="history-meet-detail" className="surface-panel scroll-mt-24 p-3 sm:scroll-mt-32 sm:p-4 space-y-3">
            {!selectedMeetSlug ? (
              <p className="text-sm text-muted-foreground">Seleziona un meeting.</p>
            ) : (
              <>
                <div className="rounded-xl border border-border/60 bg-card/25 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h2 className="text-xl font-display font-bold">{meetDetail?.meet?.meetName ?? "Meeting"}</h2>
                      <p className="text-xs text-muted-foreground">Data: {formatDate(meetDetail?.meet?.meetDate)}</p>
                    </div>
                    <Button type="button" variant="outline-neon" size="sm" className="xl:hidden" onClick={jumpToList}>
                      Torna all'elenco
                    </Button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <HistoryMetricCircle label="Risultati" tone="cyan" value={String(meetSummary.resultsCount)} />
                    <HistoryMetricCircle label="Atleti" tone="lime" value={String(meetSummary.athletesCount)} />
                    <HistoryMetricCircle
                      label="Record"
                      tone="amber"
                      value={String(meetSummary.recordCount)}
                      highlight={meetSummary.recordCount > 0}
                    />
                  </div>
                </div>

                <div className="grid gap-2 md:grid-cols-3">
                  <Input
                    placeholder="Filtra atleta"
                    value={searchAthlete}
                    onChange={(e) => setSearchAthlete(e.target.value)}
                  />
                  <Input
                    placeholder="Filtra evento"
                    value={eventFilter}
                    onChange={(e) => setEventFilter(e.target.value)}
                  />
                  <Select value={sort} onValueChange={(value) => setSort(value as any)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="points_desc">Punti (desc)</SelectItem>
                      <SelectItem value="time_asc">Tempo (asc)</SelectItem>
                      <SelectItem value="time_desc">Tempo (desc)</SelectItem>
                      <SelectItem value="athlete_asc">Atleta (A-Z)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  {resultsQuery.isLoading ? (
                    <p className="text-sm text-muted-foreground">Caricamento risultati...</p>
                  ) : results.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nessun risultato per i filtri selezionati.</p>
                  ) : (
                    results.map((row: any) => {
                      const hasRecord = Boolean(String(row.record_raw ?? "").trim());
                      return (
                        <div
                          key={row.id}
                          className={`relative overflow-hidden rounded-2xl border bg-card/30 p-3 ${
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
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-sm font-semibold break-words">{row.athlete_name}</p>
                              <Badge variant="outline" className="max-w-full truncate">{row.event_label}</Badge>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <HistoryMetricCircle
                                size="sm"
                                tone="cyan"
                                label="Tempo"
                                value={formatTime(row.final_time_raw)}
                              />
                              <HistoryMetricCircle
                                size="sm"
                                tone="amber"
                                label="Record"
                                value={hasRecord ? String(row.record_raw) : "-"}
                                highlight={hasRecord}
                              />
                              <HistoryMetricCircle
                                size="sm"
                                tone="lime"
                                label="Punti"
                                value={formatPoints(row.points)}
                              />
                            </div>
                            {row.notes ? (
                              <p className="mt-1 text-xs text-muted-foreground break-words">Note: {row.notes}</p>
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
