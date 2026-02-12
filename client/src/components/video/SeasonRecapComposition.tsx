import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { ReactNode } from "react";

type RecapMission = {
  id: string;
  title: string;
  progress: number;
  xpReward: number;
  completed: boolean;
};

type RecapHighlight = {
  id: number;
  name: string;
  distanceMeters: number;
  durationSeconds: number;
  pacePer100m: number;
  xpEarned: number;
  activityDate: string | null;
  isOpenWater: boolean;
};

type RecapPayload = {
  generatedAt: string;
  user: {
    id: number;
    displayName: string;
    avatarUrl: string | null;
  };
  season: {
    id: string;
    name: string;
    number: number;
    remainingDays: number;
    level: number;
    seasonXp: number;
    levelProgressPercent: number;
    xpToNextLevel: number;
  };
  missions: {
    completed: number;
    total: number;
    completionRate: number;
    dailyPreview: RecapMission[];
    weeklyPreview: RecapMission[];
  };
  leaderboard: {
    topThree: Array<{
      rank: number;
      name: string;
      seasonXp: number;
      userId: number;
    }>;
    me: { rank: number; seasonXp: number } | null;
  };
  highlights: RecapHighlight[];
};

export type SeasonRecapCompositionProps = {
  data: RecapPayload;
};

const formatDistance = (meters: number) => {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters)} m`;
};

const formatDuration = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const hours = Math.floor(mins / 60);
  if (hours > 0) return `${hours}h ${mins % 60}m`;
  return `${mins} min`;
};

const formatPace = (pacePer100m: number) => {
  if (!pacePer100m || pacePer100m <= 0) return "—";
  const mins = Math.floor(pacePer100m / 60);
  const secs = Math.round(pacePer100m % 60);
  return `${mins}:${String(secs).padStart(2, "0")}/100m`;
};

export function SeasonRecapComposition({ data }: SeasonRecapCompositionProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const section = Math.floor(frame / 120); // 4 sections x 4 sec
  const fadeIn = spring({ frame, fps, durationInFrames: 24 });
  const slideY = interpolate(fadeIn, [0, 1], [18, 0]);

  const topThree = data.leaderboard.topThree.slice(0, 3);
  const highlights = data.highlights.slice(0, 3);
  const missions = [...data.missions.dailyPreview, ...data.missions.weeklyPreview].slice(0, 3);

  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(circle at 20% 15%, rgba(0,220,255,0.30), transparent 45%), radial-gradient(circle at 85% 10%, rgba(110,255,140,0.22), transparent 42%), linear-gradient(145deg, #041223 0%, #071a2e 52%, #0a1f34 100%)",
        color: "#e9f7ff",
        fontFamily: "Inter, system-ui, sans-serif",
        padding: 46,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 26,
          borderRadius: 26,
          border: "1px solid rgba(119,238,255,0.28)",
          boxShadow: "0 0 40px rgba(0,210,255,0.22), inset 0 0 26px rgba(130,255,196,0.08)",
          pointerEvents: "none",
        }}
      />

      <div style={{ opacity: fadeIn, transform: `translateY(${slideY}px)` }}>
        <div style={{ fontSize: 18, letterSpacing: 1.2, opacity: 0.86 }}>SWIMFORGE SEASON RECAP</div>
        <div style={{ marginTop: 10, fontSize: 52, fontWeight: 800, lineHeight: 1.08 }}>{data.season.name}</div>
        <div style={{ marginTop: 10, fontSize: 28, color: "#9fffe1", fontWeight: 700 }}>
          {data.user.displayName}
        </div>
      </div>

      {section === 0 && (
        <div
          style={{
            marginTop: 72,
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 18,
          }}
        >
          <StatPill label="Level" value={`Lv ${data.season.level}`} />
          <StatPill label="Season XP" value={`${data.season.seasonXp.toLocaleString()} XP`} />
          <StatPill label="Missioni" value={`${data.missions.completed}/${data.missions.total}`} />
          <div style={{ gridColumn: "1 / span 3", marginTop: 10 }}>
            <ProgressBar value={data.season.levelProgressPercent} label={`Progress ${data.season.levelProgressPercent}%`} />
          </div>
        </div>
      )}

      {section === 1 && (
        <div style={{ marginTop: 56 }}>
          <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 14 }}>Missioni & Sessioni Top</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div style={{ display: "grid", gap: 12 }}>
              {missions.map((mission) => (
                <Card key={mission.id} title={mission.title} subtitle={`+${mission.xpReward} XP`}>
                  <ProgressBar value={mission.progress} label={`${mission.progress}%`} />
                </Card>
              ))}
            </div>
            <div style={{ display: "grid", gap: 12 }}>
              {highlights.map((item) => (
                <Card key={item.id} title={item.name} subtitle={item.isOpenWater ? "Open Water" : "Piscina"}>
                  <div style={{ fontSize: 16, opacity: 0.92 }}>
                    {formatDistance(item.distanceMeters)} · {formatDuration(item.durationSeconds)} ·{" "}
                    {formatPace(item.pacePer100m)} · +{item.xpEarned} XP
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </div>
      )}

      {section === 2 && (
        <div style={{ marginTop: 62 }}>
          <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 14 }}>Classifica Season</div>
          <div style={{ display: "grid", gap: 12 }}>
            {topThree.map((row) => (
              <Card key={row.userId} title={`#${row.rank} · ${row.name}`} subtitle={`${row.seasonXp.toLocaleString()} XP`}>
                <div style={{ fontSize: 14, opacity: 0.85 }}>Top performer della settimana</div>
              </Card>
            ))}
            <Card
              title="La tua posizione"
              subtitle={
                data.leaderboard.me
                  ? `#${data.leaderboard.me.rank} · ${data.leaderboard.me.seasonXp.toLocaleString()} XP`
                  : "Fuori Top"
              }
            >
              <div style={{ fontSize: 14, opacity: 0.85 }}>Continua così per scalare la classifica.</div>
            </Card>
          </div>
        </div>
      )}

      {section === 3 && (
        <div style={{ marginTop: 86 }}>
          <div style={{ fontSize: 42, fontWeight: 800, lineHeight: 1.1 }}>Prossimo obiettivo</div>
          <div style={{ marginTop: 14, fontSize: 30, color: "#8ef3ff", fontWeight: 700 }}>
            {data.season.xpToNextLevel.toLocaleString()} XP al prossimo livello
          </div>
          <div style={{ marginTop: 18, fontSize: 24, opacity: 0.92 }}>
            Mancano {data.season.remainingDays} giorni alla fine della season.
          </div>
          <div style={{ marginTop: 30, fontSize: 18, opacity: 0.8 }}>Recap generato il {new Date(data.generatedAt).toLocaleDateString("it-IT")}</div>
        </div>
      )}
    </AbsoluteFill>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div
      style={{
        borderRadius: 18,
        border: "1px solid rgba(126,244,255,0.28)",
        background: "linear-gradient(135deg, rgba(7,32,54,0.72), rgba(14,48,74,0.46))",
        padding: "14px 16px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
        <div style={{ fontSize: 18, fontWeight: 700 }}>{title}</div>
        <div style={{ fontSize: 15, color: "#9af1d3", fontWeight: 600 }}>{subtitle}</div>
      </div>
      {children}
    </div>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        borderRadius: 18,
        border: "1px solid rgba(126,244,255,0.24)",
        padding: "16px 18px",
        background: "rgba(7,32,54,0.62)",
      }}
    >
      <div style={{ fontSize: 14, opacity: 0.75, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function ProgressBar({ value, label }: { value: number; label: string }) {
  const safe = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 13, opacity: 0.76 }}>{label}</span>
        <span style={{ fontSize: 13, opacity: 0.76 }}>{safe}%</span>
      </div>
      <div
        style={{
          height: 8,
          borderRadius: 999,
          background: "rgba(255,255,255,0.16)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${safe}%`,
            height: "100%",
            borderRadius: 999,
            background: "linear-gradient(90deg, #29dcff, #66ff9f)",
            boxShadow: "0 0 18px rgba(80,231,255,0.45)",
          }}
        />
      </div>
    </div>
  );
}
