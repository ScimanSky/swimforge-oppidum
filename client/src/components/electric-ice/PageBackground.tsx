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
  // Prefer bright outdoor water/pool imagery and keep it subtle under the overlay.
  if (path === "/" || path.startsWith("/dashboard")) {
    return { key: "dashboard", image: "/images/hero-swimmer.jpg", position: "center 30%" };
  }
  if (path.startsWith("/community")) {
    return { key: "community", image: "/images/pool-lanes.jpg", position: "center 35%" };
  }
  if (path.startsWith("/activities") || path.startsWith("/statistics")) {
    return { key: "stats", image: "/images/open-water.jpg", position: "center 30%" };
  }
  if (path.startsWith("/coach")) {
    return { key: "coach", image: "/images/swimmer_smartwatch_tech.webp", position: "center 25%" };
  }
  if (path.startsWith("/profile") || path.startsWith("/settings")) {
    return { key: "profile", image: "/images/swimmer_female_portrait.webp", position: "center 20%" };
  }
  return { key: "default", image: "/images/pool-lanes.jpg", position: "center 35%" };
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
          animate={{ opacity: isDark ? 0.16 : 0.24 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      </AnimatePresence>

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
