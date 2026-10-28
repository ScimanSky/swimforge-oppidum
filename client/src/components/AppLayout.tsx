import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { AppShell } from "./app/app-shell";
import { useInShell } from "./app/shell-context";

interface AppLayoutProps {
  children: ReactNode;
  className?: string;
  withShell?: boolean;
  showBubbles?: boolean;
  bubbleIntensity?: string;
}

/**
 * Page wrapper. Under the persistent shell (ShellRoutes) it is only the page root: the shell
 * already draws header, navigation and main. Outside it (public pages, tests) it draws the
 * full-screen background and, with `withShell`, its own AppShell.
 */
export function AppLayout({
  children,
  className = "",
  withShell = true,
}: AppLayoutProps) {
  const inShell = useInShell();
  if (inShell) {
    return (
      <div className={cn(withShell && "sf-page-root", className)}>
        {children}
      </div>
    );
  }

  const wrappedChildren = withShell ? <div className="sf-page-root">{children}</div> : children;

  return (
    <div
      className={`relative min-h-screen bg-background text-foreground ${className} overflow-hidden`}
    >
      <div className="relative z-10">
        {withShell ? <AppShell>{wrappedChildren}</AppShell> : wrappedChildren}
      </div>
    </div>
  );
}

export default AppLayout;
