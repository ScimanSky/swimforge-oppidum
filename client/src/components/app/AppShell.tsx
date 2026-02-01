import { useState } from "react";
import { AppHeader } from "./AppHeader";
import { AppBottomNav } from "./AppBottomNav";
import { AppSidebar } from "./AppSidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background flex">
      <AppSidebar open={sidebarOpen} onOpenChange={setSidebarOpen} />

      <div className="flex-1 flex flex-col min-h-screen lg:ml-64">
        <AppHeader onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 pb-20 lg:pb-0">{children}</main>
        <AppBottomNav />
      </div>
    </div>
  );
}

export default AppShell;
