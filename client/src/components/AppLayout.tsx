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
      <div className={`min-h-screen bg-background ${className}`}>
        <AppShell>{children}</AppShell>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-background ${className}`}>
      {children}
    </div>
  );
}

export default AppLayout;
