import { ReactNode } from "react";
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
 * Unified layout wrapper for the V0 layout.
 */
export function AppLayout({
  children,
  className = "",
  withShell = true,
}: AppLayoutProps) {
  if (withShell) {
    return (
      <div className={`min-h-screen bg-background dark:bg-[radial-gradient(circle_at_top,_var(--neon-soft),_transparent_65%)] ${className}`}>
        <AppShell>{children}</AppShell>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-background dark:bg-[radial-gradient(circle_at_top,_var(--neon-soft),_transparent_65%)] ${className}`}>
      {children}
    </div>
  );
}

export default AppLayout;
