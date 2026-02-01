import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  Home,
  Activity,
  Users,
  Trophy,
  User,
  Settings,
  Waves,
  Brain,
  BarChart3,
  X,
} from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";

const mainNav = [
  { href: "/dashboard", icon: Home, label: "Dashboard" },
  { href: "/activities", icon: Activity, label: "Attività" },
  { href: "/community", icon: Users, label: "Club" },
  { href: "/challenges", icon: Trophy, label: "Sfide" },
  { href: "/coach", icon: Brain, label: "AI Coach" },
];

const secondaryNav = [
  { href: "/statistics", icon: BarChart3, label: "Stats" },
  { href: "/profile", icon: User, label: "Profilo" },
  { href: "/settings", icon: Settings, label: "Impostazioni" },
];

interface AppSidebarProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AppSidebar({ open, onOpenChange }: AppSidebarProps) {
  const [location] = useLocation();
  const { isAuthenticated } = useAuth();
  const { data: profile } = trpc.profile.get.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const level = typeof profile?.level === "number" ? profile.level : 1;
  const totalXp = profile?.totalXp ?? profile?.total_xp ?? 0;
  const xpToNext = profile?.xpToNextLevel ?? profile?.xp_to_next_level ?? 0;
  const nextLevelXp = profile?.nextLevelXp ?? profile?.next_level_xp ?? 1;
  const progress = nextLevelXp ? Math.min(100, (totalXp / nextLevelXp) * 100) : 0;

  const isActive = (href: string) =>
    location === href || location.startsWith(`${href}/`);

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      <div className="p-4 flex items-center justify-between">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
            <Waves className="w-6 h-6 text-primary-foreground" />
          </div>
          <span className="font-display text-xl font-bold text-foreground">
            SwimForge
          </span>
        </Link>
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={() => onOpenChange(false)}
        >
          <X className="w-5 h-5" />
        </Button>
      </div>

      <div className="mx-4 p-4 rounded-xl bg-secondary/50 mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-foreground">
            Livello {level}
          </span>
          <span className="text-xs text-muted-foreground">
            {totalXp} / {nextLevelXp} XP
          </span>
        </div>
        <Progress value={progress} className="h-2" />
        <p className="text-xs text-muted-foreground mt-2">
          {xpToNext} XP al prossimo livello
        </p>
      </div>

      <nav className="flex-1 px-2">
        <div className="space-y-1">
          {mainNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => onOpenChange(false)}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive(item.href)
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              )}
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </Link>
          ))}
        </div>

        <div className="my-6 h-px bg-border" />

        <div className="space-y-1">
          {secondaryNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => onOpenChange(false)}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive(item.href)
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              )}
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:flex fixed left-0 top-0 bottom-0 w-64 bg-card border-r border-border flex-col z-50">
        <SidebarContent />
      </aside>

      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="left" className="w-64 p-0 bg-card">
          <SidebarContent />
        </SheetContent>
      </Sheet>
    </>
  );
}

export default AppSidebar;
