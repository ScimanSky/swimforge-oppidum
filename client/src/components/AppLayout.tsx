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
  const wrappedChildren = withShell ? <div className="sf-page-root">{children}</div> : children;

  const layout = (
    <div
      className={`relative min-h-screen bg-background text-foreground ${className} overflow-hidden`}
    >
      <div className="relative z-10">
        {withShell ? <AppShell>{wrappedChildren}</AppShell> : wrappedChildren}
      </div>
    </div>
  );

  return layout;
}

export default AppLayout;
