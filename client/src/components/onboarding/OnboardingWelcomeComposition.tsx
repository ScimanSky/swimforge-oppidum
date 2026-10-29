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
    title: "Condividi post e attività",
    subtitle: "Feed completo con foto, video, tag e reazioni.",
  },
  {
    title: "Sblocca badge e obiettivi",
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
          border: "2px solid var(--border)",
          background: "var(--card)",
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            borderRadius: 999,
            padding: "8px 18px",
            fontSize: 22,
            fontWeight: 600,
            color: "var(--action-text)",
            background: "color-mix(in oklch, var(--primary) 15%, transparent)",
            marginBottom: 26,
          }}
        >
          Tour di SwimForge
        </div>
        {/* Inside the welcome dialog (its title is the h2): a heading of the video. */}
        <h3
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 76,
            lineHeight: 1.02,
            margin: 0,
            marginBottom: 16,
            color: "var(--foreground)",
            fontWeight: 700,
          }}
        >
          {title}
        </h3>
        <p
          style={{
            margin: 0,
            fontSize: 34,
            lineHeight: 1.3,
            color: "var(--muted-foreground)",
            maxWidth: 760,
          }}
        >
          {subtitle}
        </p>
      </div>
    </div>
  );
}

/** The welcome video (Remotion): Corsia surfaces from the page's own tokens, so both themes work. */
export function OnboardingWelcomeComposition({ userName }: OnboardingWelcomeCompositionProps) {
  const frame = useCurrentFrame();
  const pulse = interpolate(Math.sin(frame / 18), [-1, 1], [0.2, 0.55]);

  const currentSceneIndex = Math.floor(frame / SCENE_DURATION);
  const greeting = userName?.trim() ? `Ciao ${userName.trim()},` : "Ciao,";

  return (
    <AbsoluteFill
      style={{
        background: "var(--background)",
        fontFamily: "var(--font-sans)",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 48,
          left: 62,
          fontSize: 34,
          color: "var(--foreground)",
          fontWeight: 600,
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
            color: "var(--muted-foreground)",
            fontSize: 24,
          }}
        >
          Preparazione del tour interattivo
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
                  background: active ? "var(--primary)" : "var(--border)",
                  opacity: active ? 0.45 + pulse : 1,
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
