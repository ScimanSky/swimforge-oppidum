import { ReactNode } from "react";
import { BubbleAnimation } from "./BubbleAnimation";

interface AppLayoutProps {
  children: ReactNode;
  showBubbles?: boolean;
  bubbleIntensity?: "low" | "medium" | "high";
  className?: string;
}

/**
 * AppLayout Component
 * 
 * Unified layout wrapper that applies the SwimForge Dark Gaming Neon theme
 * consistently across all pages. Includes optional bubble animation background.
 * 
 * Design Philosophy:
 * - Navy Deep background (#1F1F3F) for immersive dark theme
 * - Azure accent colors for interactive elements
 * - Gold accents for CTAs and highlights
 * - Floating bubble animations for visual interest
 */
export function AppLayout({
  children,
  showBubbles = true,
  bubbleIntensity = "medium",
  className = "",
}: AppLayoutProps) {
  return (
    <div className={`min-h-screen bg-[var(--navy)] relative overflow-hidden ${className}`}>
      {/* Animated gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-[var(--navy)] via-[var(--navy-light)] to-[var(--azure)] opacity-95 pointer-events-none" />

      {/* Wave overlay */}
      <div className="absolute inset-0 pointer-events-none">
        <svg
          className="absolute bottom-0 left-0 w-full h-56 opacity-10 text-white"
          viewBox="0 0 1440 320"
          preserveAspectRatio="none"
        >
          <path
            fill="currentColor"
            d="M0,192L48,197.3C96,203,192,213,288,229.3C384,245,480,267,576,250.7C672,235,768,181,864,181.3C960,181,1056,235,1152,234.7C1248,235,1344,181,1392,154.7L1440,128L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"
          />
        </svg>
      </div>
      
      {/* Bubble animation background */}
      {showBubbles && (
        <BubbleAnimation
          count={20}
          intensity={bubbleIntensity}
          className="fixed inset-0 z-0"
          bubbleColor="bg-white/20"
        />
      )}
      
      {/* Content */}
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
}

export default AppLayout;
