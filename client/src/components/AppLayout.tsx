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
    <div className={`min-h-screen bg-background relative overflow-hidden ${className}`}>
      {/* Animated gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-[var(--navy)] via-[var(--navy-light)] to-[var(--azure)] opacity-5 pointer-events-none" />
      
      {/* Bubble animation background */}
      {showBubbles && (
        <BubbleAnimation
          count={20}
          intensity={bubbleIntensity}
          className="fixed inset-0 z-0"
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
