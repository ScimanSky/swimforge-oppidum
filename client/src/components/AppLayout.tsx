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
  const layout = (
    <div
      className={`relative min-h-screen bg-background ${className}`}
    >
      <div className="pointer-events-none absolute inset-0 opacity-80 dark:opacity-100">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_color-mix(in_oklch,var(--accent)_55%,transparent),_transparent_55%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_15%,_color-mix(in_oklch,var(--primary)_50%,transparent),_transparent_55%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,_color-mix(in_oklch,var(--background)_40%,transparent),_color-mix(in_oklch,var(--background)_90%,transparent))] dark:block hidden" />
      </div>
      <div className="relative z-10">
        {withShell ? <AppShell>{children}</AppShell> : children}
      </div>
    </div>
  );

  return layout;
}

export default AppLayout;
