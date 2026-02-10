import { AnimatePresence, motion } from "framer-motion";
import { useMemo } from "react";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";

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

  return (
    <div
      aria-hidden="true"
      className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}
    >
      <div className="absolute inset-0 ei-bg-grid opacity-[0.07]" />

      <AnimatePresence initial={false} mode="wait">
        <motion.div
          key={bg.key}
          className="absolute inset-0 bg-cover bg-no-repeat"
          style={{
            backgroundImage: `url(${bg.image})`,
            backgroundPosition: bg.position ?? "center",
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.22 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      </AnimatePresence>

      {/* Bright "ice" wash over the image (70-80% overlay) */}
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,color-mix(in_oklch,var(--background)_82%,transparent),color-mix(in_oklch,var(--background)_92%,transparent))]" />

      {/* Accent glows, kept subtle to avoid harming readability */}
      <div className="absolute -top-40 -right-40 h-[520px] w-[520px] ei-blob" />
      <div className="absolute -bottom-48 -left-48 h-[560px] w-[560px] ei-blob-lime" />
      <div className="absolute top-[38%] -left-32 h-[420px] w-[420px] ei-blob-coral" />

      {/* Gentle vignette to anchor content */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,transparent_55%,color-mix(in_oklch,var(--background)_75%,transparent)_100%)]" />
    </div>
  );
}

