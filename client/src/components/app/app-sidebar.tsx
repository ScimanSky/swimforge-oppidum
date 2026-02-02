"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import {
  Home,
  Activity,
  Users,
  Trophy,
  BarChart3,
  User,
  Settings,
  Waves,
  Brain,
  Target,
  X,
} from "lucide-react"

const mainNav = [
  { href: "/dashboard", icon: Home, label: "Dashboard" },
  { href: "/activities", icon: Activity, label: "Activities" },
  { href: "/community", icon: Users, label: "Community" },
  { href: "/statistics", icon: BarChart3, label: "Stats" },
  { href: "/challenges", icon: Trophy, label: "Challenges" },
  { href: "/coach", icon: Brain, label: "AI Coach" },
]

const secondaryNav = [
  { href: "/profile", icon: User, label: "Profile" },
  { href: "/goals", icon: Target, label: "Goals" },
  { href: "/settings", icon: Settings, label: "Settings" },
]

interface AppSidebarProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AppSidebar({ open, onOpenChange }: AppSidebarProps) {
  const pathname = usePathname()

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="p-4 flex items-center justify-between">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
            <Waves className="w-6 h-6 text-primary-foreground" />
          </div>
          <span className="font-display text-xl font-bold text-foreground">SwimForge</span>
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

      {/* XP Progress */}
      <div className="mx-4 p-4 rounded-xl bg-secondary/50 mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-foreground">Level 42</span>
          <span className="text-xs text-muted-foreground">2,450 / 3,000 XP</span>
        </div>
        <Progress value={82} className="h-2" />
        <p className="text-xs text-muted-foreground mt-2">550 XP to Level 43</p>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 px-2">
        <div className="space-y-1">
          {mainNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => onOpenChange(false)}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                pathname === item.href
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
                pathname === item.href
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

      {/* Quick Stats */}
      <div className="p-4 border-t border-border">
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-lg bg-secondary/50">
            <p className="text-lg font-display font-bold text-primary">1,234</p>
            <p className="text-xs text-muted-foreground">km total</p>
          </div>
          <div className="p-3 rounded-lg bg-secondary/50">
            <p className="text-lg font-display font-bold text-accent">28</p>
            <p className="text-xs text-muted-foreground">badges</p>
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex fixed left-0 top-0 bottom-0 w-64 bg-card border-r border-border flex-col z-50">
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar */}
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="left" className="w-64 p-0 bg-card">
          <SidebarContent />
        </SheetContent>
      </Sheet>
    </>
  )
}
