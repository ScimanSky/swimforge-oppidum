import { ReactNode, useMemo } from "react";
import { motion } from "framer-motion";
import { AppShell } from "./app/app-shell";
import { useTheme } from "@/contexts/ThemeContext";

interface AppLayoutProps {
  children: ReactNode;
  className?: string;
  withShell?: boolean;
  showBubbles?: boolean;
  bubbleIntensity?: string;
}

/** Floating particle positions - stable across renders */
const PARTICLES = Array.from({ length: 12 }, (_, i) => ({
  id: i,
  left: `${8 + (i * 7.3) % 84}%`,
  top: `${5 + (i * 11.7) % 85}%`,
  size: 2 + (i % 3),
  delay: i * 0.7,
  duration: 6 + (i % 4) * 2,
}));

/**
 * AppLayout Component
 *
 * Unified layout wrapper with animated neon background,
 * aquatic background images, and floating particle effects.
 */
export function AppLayout({
  children,
  className = "",
  withShell = true,
}: AppLayoutProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const particles = useMemo(() => PARTICLES, []);

  return (
    <div
      className={`relative min-h-screen overflow-hidden ${
        isDark ? "bg-app-dark" : "bg-app-light"
      } ${className}`}
    >
      {/* Background overlay for readability */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: isDark
            ? "linear-gradient(180deg, oklch(0.06 0.025 250 / 0.85) 0%, oklch(0.06 0.025 250 / 0.92) 50%, oklch(0.06 0.025 250 / 0.88) 100%)"
            : "linear-gradient(180deg, oklch(0.97 0.006 230 / 0.88) 0%, oklch(0.97 0.006 230 / 0.94) 50%, oklch(0.97 0.006 230 / 0.90) 100%)",
        }}
      />

      {/* Animated neon background orbs */}
      <div className="pointer-events-none absolute inset-0">
        {/* Primary neon orb - top left */}
        <motion.div
          className="absolute -top-[20%] -left-[10%] h-[60vh] w-[60vh] rounded-full"
          style={{
            background: `radial-gradient(circle, var(--neon-glow), transparent 70%)`,
          }}
          animate={{
            x: [0, 40, -30, 0],
            y: [0, -30, 20, 0],
            scale: [1, 1.15, 0.9, 1],
          }}
          transition={{
            duration: 10,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />

        {/* Accent orb - bottom right */}
        <motion.div
          className="absolute -right-[15%] -bottom-[15%] h-[50vh] w-[50vh] rounded-full"
          style={{
            background: `radial-gradient(circle, var(--neon-accent), transparent 70%)`,
          }}
          animate={{
            x: [0, -35, 20, 0],
            y: [0, 25, -30, 0],
            scale: [1, 0.9, 1.12, 1],
          }}
          transition={{
            duration: 14,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />

        {/* Center flowing orb */}
        <motion.div
          className="absolute top-[35%] left-[50%] h-[45vh] w-[45vh] -translate-x-1/2 rounded-full"
          style={{
            background: `radial-gradient(circle, color-mix(in oklch, var(--primary) 8%, transparent), transparent 70%)`,
          }}
          animate={{
            x: [0, 50, -40, 0],
            y: [0, -40, 30, 0],
            scale: [1, 1.1, 0.95, 1],
          }}
          transition={{
            duration: 16,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />

        {/* Top right secondary glow */}
        <motion.div
          className="absolute -top-[5%] right-[20%] h-[30vh] w-[30vh] rounded-full"
          style={{
            background: `radial-gradient(circle, color-mix(in oklch, var(--primary) 6%, transparent), transparent 70%)`,
          }}
          animate={{
            x: [0, -20, 30, 0],
            y: [0, 15, -10, 0],
          }}
          transition={{
            duration: 20,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />

        {/* Floating particles */}
        {particles.map((p) => (
          <motion.div
            key={p.id}
            className="absolute rounded-full"
            style={{
              left: p.left,
              top: p.top,
              width: p.size,
              height: p.size,
              background: isDark
                ? `oklch(0.72 0.19 195 / 0.5)`
                : `oklch(0.62 0.17 195 / 0.3)`,
              boxShadow: isDark
                ? `0 0 ${p.size * 3}px oklch(0.72 0.19 195 / 0.3)`
                : `0 0 ${p.size * 2}px oklch(0.62 0.17 195 / 0.15)`,
            }}
            animate={{
              y: [0, -(15 + p.size * 5), -(5 + p.size * 2), 0],
              x: [0, (p.id % 2 === 0 ? 10 : -10), (p.id % 2 === 0 ? -5 : 5), 0],
              opacity: [0.3, 0.8, 0.5, 0.3],
            }}
            transition={{
              duration: p.duration,
              delay: p.delay,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        ))}

        {/* Noise/grain overlay for depth */}
        <div
          className="absolute inset-0 opacity-[0.02] dark:opacity-[0.04]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
            backgroundSize: "128px 128px",
          }}
        />
      </div>

      {/* Content layer */}
      <div className="relative z-10">
        {withShell ? <AppShell>{children}</AppShell> : children}
      </div>
    </div>
  );
}

export default AppLayout;
