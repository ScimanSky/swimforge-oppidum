import { AnimatePresence, motion } from "framer-motion";
import { useMemo } from "react";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useTheme } from "@/contexts/ThemeContext";

type BgSpec = {
  key: string;
  image: string;
  position?: string;
};

const pickBackground = (path: string): BgSpec => {
  if (
    path === "/" ||
    path.startsWith("/auth") ||
    path.startsWith("/login") ||
    path.startsWith("/register") ||
    path.startsWith("/signup") ||
    path.startsWith("/forgot-password") ||
    path.startsWith("/reset-password")
  ) {
    return { key: "auth-v2", image: "/images/theme-v2/auth-hero.png", position: "center 34%" };
  }
  if (path.startsWith("/dashboard")) {
    return { key: "dashboard-v2", image: "/images/theme-v2/dashboard-hero.png", position: "center 36%" };
  }
  if (path.startsWith("/activities")) {
    return { key: "activities-v2", image: "/images/theme-v2/activities-hero.png", position: "center 40%" };
  }
  if (path.startsWith("/statistics")) {
    return { key: "statistics-v2", image: "/images/theme-v2/statistics-hero.png", position: "center 35%" };
  }
  if (path.startsWith("/challenges") || path.startsWith("/leaderboard")) {
    return { key: "challenges-v2", image: "/images/theme-v2/challenges-hero.png", position: "center 38%" };
  }
  if (path.startsWith("/season")) {
    return { key: "season-v2", image: "/images/theme-v2/season-hero.png", position: "center 34%" };
  }
  if (path.startsWith("/badges")) {
    return { key: "badges-v2", image: "/images/theme-v2/badges-hero.png", position: "center 34%" };
  }
  if (path.startsWith("/community/club")) {
    return { key: "club-detail-v2", image: "/images/theme-v2/club-detail-hero.png", position: "center 40%" };
  }
  if (path.startsWith("/community")) {
    return { key: "community-v2", image: "/images/theme-v2/community-hero.png", position: "center 37%" };
  }
  if (path.startsWith("/coach")) {
    return { key: "coach-v2", image: "/images/theme-v2/coach-ai-hero.png", position: "center 36%" };
  }
  if (path.startsWith("/goals")) {
    return { key: "goals-v2", image: "/images/theme-v2/goals-hero.png", position: "center 35%" };
  }
  if (path.startsWith("/profile") || path.startsWith("/settings")) {
    return {
      key: "profile-settings-v2",
      image: "/images/theme-v2/profile-settings-hero.png",
      position: "center 36%",
    };
  }
  return { key: "default-v2", image: "/images/theme-v2/dashboard-hero.png", position: "center 36%" };
};

export default function PageBackground({ className }: { className?: string }) {
  const [location] = useLocation();
  const bg = useMemo(() => pickBackground(location), [location]);
  const { theme } = useTheme();
  const isDark = theme === "dark";

  return (
    <div
      aria-hidden="true"
      className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}
    >
      <div className={cn("absolute inset-0 ei-bg-grid", isDark ? "opacity-[0.06]" : "opacity-[0.07]")} />

      <AnimatePresence initial={false} mode="wait">
        <motion.div
          key={bg.key}
          className="absolute inset-0 bg-cover bg-no-repeat"
          style={{
            backgroundImage: `url(${bg.image})`,
            backgroundPosition: bg.position ?? "center",
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: isDark ? 0.17 : 0.26 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      </AnimatePresence>

      <motion.div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat mix-blend-screen"
        style={{ backgroundImage: "url('/images/theme-v2/overlay-caustics.png')" }}
        animate={{
          opacity: isDark ? [0.13, 0.18, 0.13] : [0.1, 0.15, 0.1],
          scale: [1, 1.015, 1],
        }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
      />

      <motion.div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat mix-blend-screen"
        style={{ backgroundImage: "url('/images/theme-v2/overlay-energy-rings.png')" }}
        animate={{
          opacity: isDark ? [0.11, 0.18, 0.11] : [0.08, 0.13, 0.08],
          scale: [1.01, 1.03, 1.01],
          rotate: [0, 0.4, 0],
        }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Wash over the image to keep content readable. */}
      <div
        className={cn(
          "absolute inset-0",
          isDark
            ? "bg-[linear-gradient(to_bottom,color-mix(in_oklch,var(--background)_55%,black),color-mix(in_oklch,var(--background)_88%,black))]"
            : "bg-[linear-gradient(to_bottom,color-mix(in_oklch,var(--background)_62%,transparent),color-mix(in_oklch,var(--background)_78%,transparent))]",
        )}
      />

      {/* Accent glows, kept subtle to avoid harming readability */}
      <div className="absolute -top-40 -right-40 h-[520px] w-[520px] ei-blob" />
      <div className="absolute -bottom-48 -left-48 h-[560px] w-[560px] ei-blob-lime" />

      {/* Gentle vignette to anchor content */}
      <div
        className={cn(
          "absolute inset-0",
          isDark
            ? "bg-[radial-gradient(circle_at_center,transparent_0%,transparent_58%,color-mix(in_oklch,var(--background)_78%,black)_100%)]"
            : "bg-[radial-gradient(circle_at_center,transparent_0%,transparent_55%,color-mix(in_oklch,var(--background)_75%,transparent)_100%)]",
        )}
      />
    </div>
  );
}
