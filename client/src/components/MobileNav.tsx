import { Link, useLocation } from "wouter";
import { Home, Medal, Users, Activity, BarChart3, Waves } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", icon: Home, label: "Home" },
  { href: "/activities", icon: Activity, label: "Attività" },
  { href: "/badges", icon: Medal, label: "Badge" },
  { href: "/community", icon: Users, label: "Club" },
  { href: "/statistics", icon: BarChart3, label: "Stats" },
  { href: "/coach", icon: Waves, label: "Coach" },
];

export default function MobileNav() {
  const [location] = useLocation();

  return (
    <nav 
      className="fixed bottom-0 left-0 right-0 z-50 bg-sidebar/95 backdrop-blur-lg border-t border-border pb-safe"
      role="navigation"
      aria-label="Navigazione principale mobile"
    >
      <div className="flex items-center justify-between gap-1 py-2 px-2 max-w-lg mx-auto">
        {navItems.map((item) => {
          const isActive = location === item.href;
          return (
            <Link key={item.href} href={item.href}>
              <button
                className={cn(
                  "flex flex-1 min-w-0 flex-col items-center gap-1 px-1 py-2 rounded-lg transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isActive
                    ? "text-primary bg-primary/10 shadow-[0_0_15px_var(--primary)/0.2]"
                    : "text-muted-foreground hover:text-primary/80"
                )}
                aria-label={item.label}
                aria-current={isActive ? "page" : undefined}
              >
                <item.icon 
                  className={cn(
                    "h-5 w-5 transition-all",
                    isActive && "drop-shadow-[0_0_8px_var(--primary)]"
                  )} 
                  aria-hidden="true"
                />
                <span className="text-[10px] font-medium truncate max-w-[52px]">{item.label}</span>
              </button>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
