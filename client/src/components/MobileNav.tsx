import { Link, useLocation } from "wouter";
import { Home, Users, Activity, BarChart3, Trophy, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

const navItems = [
  { href: "/dashboard", icon: Home, label: "Home" },
  { href: "/activities", icon: Activity, label: "Attivita" },
  { href: "/challenges", icon: Trophy, label: "Sfide" },
  { href: "/community", icon: Users, label: "Club" },
  { href: "/statistics", icon: BarChart3, label: "Progressi" },
  { href: "/profile", icon: User, label: "Profilo" },
];

export default function MobileNav() {
  const [location] = useLocation();

  return (
    <nav className="glass-mobile-nav fixed bottom-0 left-0 right-0 z-50 pb-safe">
      {/* Top neon edge line */}
      <div
        className="absolute left-[10%] right-[10%] top-0 h-px"
        style={{
          background: "linear-gradient(90deg, transparent, var(--neon-line), transparent)",
        }}
      />

      <div className="flex items-center justify-between gap-1 py-2 px-2 max-w-lg mx-auto">
        {navItems.map((item) => {
          const isActive = location === item.href;
          return (
            <Link key={item.href} href={item.href}>
              <button
                className={cn(
                  "relative flex flex-1 min-w-0 flex-col items-center gap-1 px-2 py-2 rounded-xl transition-all duration-300",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {/* Active glow background */}
                {isActive && (
                  <motion.div
                    layoutId="mobile-nav-active"
                    className="absolute inset-0 rounded-xl"
                    style={{
                      background: "color-mix(in oklch, var(--primary) 12%, transparent)",
                      boxShadow: "0 0 20px var(--neon-glow), inset 0 0 12px color-mix(in oklch, var(--primary) 8%, transparent)",
                    }}
                    transition={{ type: "spring", stiffness: 350, damping: 30 }}
                  />
                )}

                <motion.div
                  className="relative z-10"
                  animate={isActive ? { y: -2 } : { y: 0 }}
                  transition={{ type: "spring", stiffness: 400, damping: 25 }}
                >
                  <item.icon
                    className={cn(
                      "h-5 w-5 transition-all duration-300",
                      isActive && "drop-shadow-[0_0_8px_var(--neon-glow)]"
                    )}
                  />
                </motion.div>

                <span
                  className={cn(
                    "relative z-10 text-[10px] font-medium truncate max-w-[52px] transition-all duration-300",
                    isActive && "font-semibold"
                  )}
                >
                  {item.label}
                </span>

                {/* Neon dot indicator */}
                {isActive && (
                  <motion.div
                    className="absolute -bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-primary"
                    style={{
                      boxShadow: "0 0 6px var(--neon-glow), 0 0 12px var(--neon-glow)",
                    }}
                    layoutId="mobile-nav-dot"
                    transition={{ type: "spring", stiffness: 350, damping: 30 }}
                  />
                )}
              </button>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
