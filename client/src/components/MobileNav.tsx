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
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-lg border-t border-border/70 pb-safe">
      <div className="flex items-center justify-between gap-1 py-2 px-2 max-w-lg mx-auto">
        {navItems.map((item) => {
          const isActive = location === item.href;
          return (
            <Link key={item.href} href={item.href}>
              <button
                className={cn(
                  "flex flex-1 min-w-0 flex-col items-center gap-1 px-1 py-2 rounded-lg transition-all",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
                style={isActive ? {
                  background: "oklch(0.62 0.17 195 / 0.12)",
                  boxShadow: "0 0 15px oklch(0.62 0.17 195 / 0.2)",
                } : {}}
              >
                <item.icon 
                  className={cn(
                    "h-5 w-5 transition-all",
                    isActive && "drop-shadow-[0_0_8px_oklch(0.62_0.17_195_/_0.7)]"
                  )} 
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
