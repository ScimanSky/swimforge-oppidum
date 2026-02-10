import { ReactNode } from "react";
import { motion } from "framer-motion";
import { AppShell } from "./app/app-shell";

interface AppLayoutProps {
  children: ReactNode;
  className?: string;
  withShell?: boolean;
  showBubbles?: boolean;
  bubbleIntensity?: string;
}

/**
 * AppLayout Component
 *
 * Unified layout wrapper with animated neon background.
 */
export function AppLayout({
  children,
  className = "",
  withShell = true,
}: AppLayoutProps) {
  return (
    <div className={`relative min-h-screen bg-background overflow-hidden ${className}`}>
      {/* Animated neon background orbs */}
      <div className="pointer-events-none absolute inset-0">
        {/* Primary neon orb - top left */}
        <motion.div
          className="absolute -top-[20%] -left-[10%] h-[60vh] w-[60vh] rounded-full"
          style={{
            background: "radial-gradient(circle, var(--neon-glow), transparent 70%)",
          }}
          animate={{
            x: [0, 30, -20, 0],
            y: [0, -20, 15, 0],
            scale: [1, 1.1, 0.95, 1],
          }}
          transition={{
            duration: 12,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
        {/* Accent orb - bottom right */}
        <motion.div
          className="absolute -right-[15%] -bottom-[15%] h-[50vh] w-[50vh] rounded-full"
          style={{
            background: "radial-gradient(circle, color-mix(in oklch, var(--accent) 25%, transparent), transparent 70%)",
          }}
          animate={{
            x: [0, -25, 15, 0],
            y: [0, 20, -25, 0],
            scale: [1, 0.95, 1.08, 1],
          }}
          transition={{
            duration: 15,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
        {/* Subtle mid orb */}
        <motion.div
          className="absolute top-[40%] left-[50%] h-[40vh] w-[40vh] -translate-x-1/2 rounded-full"
          style={{
            background: "radial-gradient(circle, color-mix(in oklch, var(--primary) 10%, transparent), transparent 70%)",
          }}
          animate={{
            x: [0, 40, -30, 0],
            y: [0, -30, 20, 0],
          }}
          transition={{
            duration: 18,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
        {/* Noise/grain overlay for depth */}
        <div
          className="absolute inset-0 opacity-[0.03] dark:opacity-[0.04]"
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
