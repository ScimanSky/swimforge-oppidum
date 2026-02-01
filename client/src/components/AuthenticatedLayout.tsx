import { ReactNode } from "react";
import { AppLayout } from "./AppLayout";
import MobileNav from "./MobileNav";

interface AuthenticatedLayoutProps {
  children: ReactNode;
  showBubbles?: boolean;
  bubbleIntensity?: "low" | "medium" | "high";
  /** Additional padding at the bottom for mobile nav */
  hasMobileNav?: boolean;
  className?: string;
}

/**
 * AuthenticatedLayout Component
 * 
 * Unified layout for all authenticated pages in SwimForge.
 * Combines AppLayout (background, bubbles) with MobileNav.
 * 
 * Features:
 * - Consistent dark gaming theme background
 * - Optional bubble animations
 * - Mobile bottom navigation
 * - Safe area padding for mobile devices
 * - Accessibility improvements with skip link
 */
export function AuthenticatedLayout({
  children,
  showBubbles = true,
  bubbleIntensity = "medium",
  hasMobileNav = true,
  className = "",
}: AuthenticatedLayoutProps) {
  return (
    <AppLayout
      showBubbles={showBubbles}
      bubbleIntensity={bubbleIntensity}
      className={className}
    >
      {/* Skip to main content link for accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
      >
        Vai al contenuto principale
      </a>

      {/* Main content with bottom padding for mobile nav */}
      <main
        id="main-content"
        className={hasMobileNav ? "pb-20 md:pb-0" : ""}
        role="main"
      >
        {children}
      </main>

      {/* Mobile Navigation - only visible on mobile */}
      {hasMobileNav && (
        <div className="md:hidden">
          <MobileNav />
        </div>
      )}
    </AppLayout>
  );
}

export default AuthenticatedLayout;
