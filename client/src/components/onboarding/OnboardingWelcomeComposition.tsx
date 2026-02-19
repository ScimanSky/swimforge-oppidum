import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

type OnboardingWelcomeCompositionProps = {
  userName?: string | null;
};

const scenes = [
  {
    title: "Benvenuto su SwimForge",
    subtitle: "Il tuo hub per allenamenti, club e progressi.",
  },
  {
    title: "Condividi post e attivita",
    subtitle: "Feed completo con foto, video, tag e reazioni.",
  },
  {
    title: "Sblocca Season e obiettivi",
    subtitle: "Segui il piano, guadagna XP e migliora con costanza.",
  },
  {
    title: "Pronto a iniziare?",
    subtitle: "Tra poco ti guidiamo nei punti chiave dell'app.",
  },
] as const;

const SCENE_DURATION = 105;

export const ONBOARDING_WELCOME_FPS = 30;
export const ONBOARDING_WELCOME_DURATION_FRAMES = SCENE_DURATION * scenes.length;
export const ONBOARDING_WELCOME_WIDTH = 1280;
export const ONBOARDING_WELCOME_HEIGHT = 720;

function SceneCard({ title, subtitle, frameOffset }: { title: string; subtitle: string; frameOffset: number }) {
  const frame = useCurrentFrame() - frameOffset;
  const { fps } = useVideoConfig();

  const intro = spring({
    frame,
    fps,
    config: { damping: 22, stiffness: 120 },
  });

  const outroStart = SCENE_DURATION - 22;
  const outroProgress = interpolate(frame, [outroStart, SCENE_DURATION], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const opacity = interpolate(intro - outroProgress, [0, 1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const y = interpolate(intro, [0, 1], [24, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity,
        transform: `translateY(${y}px)`,
      }}
    >
      <div
        style={{
          width: "72%",
          maxWidth: 900,
          borderRadius: 28,
          padding: "44px 52px",
          border: "1px solid rgba(96, 255, 189, 0.34)",
          background:
            "linear-gradient(135deg, rgba(2,12,33,0.92), rgba(2,20,45,0.74) 55%, rgba(8,60,63,0.45))",
          boxShadow: "0 0 42px rgba(0, 244, 255, 0.18)",
          backdropFilter: "blur(12px)",
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            border: "1px solid rgba(0,245,255,0.35)",
            borderRadius: 999,
            padding: "7px 14px",
            fontSize: 20,
            color: "rgba(190,249,255,0.9)",
            marginBottom: 26,
            letterSpacing: 0.3,
          }}
        >
          SwimForge Tour
        </div>
        <h1
          style={{
            fontSize: 72,
            lineHeight: 1.05,
            margin: 0,
            marginBottom: 16,
            color: "#ecffff",
            fontWeight: 800,
            letterSpacing: 0.2,
          }}
        >
          {title}
        </h1>
        <p
          style={{
            margin: 0,
            fontSize: 34,
            lineHeight: 1.28,
            color: "rgba(219, 245, 255, 0.87)",
            maxWidth: 760,
          }}
        >
          {subtitle}
        </p>
      </div>
    </div>
  );
}

export function OnboardingWelcomeComposition({ userName }: OnboardingWelcomeCompositionProps) {
  const frame = useCurrentFrame();
  const pulse = interpolate(Math.sin(frame / 18), [-1, 1], [0.2, 0.55]);

  const currentSceneIndex = Math.floor(frame / SCENE_DURATION);
  const greeting = userName?.trim() ? `Ciao ${userName.trim()},` : "Ciao,";

  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(circle at 18% 18%, rgba(22, 189, 255, 0.18), transparent 44%), radial-gradient(circle at 88% 24%, rgba(98, 255, 169, 0.16), transparent 42%), linear-gradient(160deg, #020817 0%, #03152d 48%, #042037 100%)",
        fontFamily: "'Rajdhani', 'Segoe UI', sans-serif",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: "8% 6%",
          borderRadius: 32,
          border: "1px solid rgba(120, 255, 210, 0.2)",
          boxShadow: "inset 0 0 70px rgba(0, 233, 255, 0.06), 0 0 70px rgba(0, 233, 255, 0.09)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "absolute",
          top: 48,
          left: 62,
          fontSize: 34,
          letterSpacing: 0.35,
          color: "rgba(219, 250, 255, 0.9)",
          fontWeight: 600,
          textShadow: "0 0 18px rgba(0, 245, 255, 0.24)",
        }}
      >
        {greeting}
      </div>

      {scenes.map((scene, idx) => (
        <SceneCard
          key={scene.title}
          title={scene.title}
          subtitle={scene.subtitle}
          frameOffset={idx * SCENE_DURATION}
        />
      ))}

      <div
        style={{
          position: "absolute",
          bottom: 40,
          left: 62,
          right: 62,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div
          style={{
            color: "rgba(198, 238, 255, 0.86)",
            fontSize: 24,
            letterSpacing: 0.2,
          }}
        >
          Preparazione tour interattivo
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          {scenes.map((scene, idx) => {
            const active = idx === currentSceneIndex;
            return (
              <div
                key={scene.title}
                style={{
                  width: active ? 42 : 14,
                  height: 14,
                  borderRadius: 999,
                  background: active
                    ? `rgba(0, 245, 255, ${0.42 + pulse})`
                    : "rgba(165, 210, 233, 0.36)",
                  boxShadow: active ? "0 0 20px rgba(0, 245, 255, 0.44)" : "none",
                  transition: "all 220ms ease",
                }}
              />
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
}
