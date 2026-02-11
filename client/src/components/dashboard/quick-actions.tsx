import { Surface, SurfaceContent, SurfaceHeader, SurfaceTitle } from "@/components/ui/surface"
import { Button } from "@/components/ui/button"
import { Plus, Upload, Target, Users } from "lucide-react"
import Link from "next/link"

const actions = [
  {
    icon: Plus,
    label: "Log Activity",
    href: "/activities/new",
    variant: "default" as const,
  },
  {
    icon: Upload,
    label: "Sync Devices",
    href: "/integrations",
    variant: "outline" as const,
  },
  {
    icon: Target,
    label: "Set Goal",
    href: "/goals",
    variant: "outline" as const,
  },
  {
    icon: Users,
    label: "Join Club",
    href: "/community/clubs",
    variant: "outline" as const,
  },
]

export function QuickActions() {
  return (
    <Surface className="bg-card border-border">
      <SurfaceHeader className="pb-2">
        <SurfaceTitle className="text-lg font-display font-bold text-foreground">
          Quick Actions
        </SurfaceTitle>
      </SurfaceHeader>
      <SurfaceContent className="grid grid-cols-2 gap-2">
        {actions.map((action) => (
          <Button
            key={action.label}
            variant={action.variant}
            className="h-auto py-3 flex-col gap-2"
            asChild
          >
            <Link href={action.href}>
              <action.icon className="w-5 h-5" />
              <span className="text-xs">{action.label}</span>
            </Link>
          </Button>
        ))}
      </SurfaceContent>
    </Surface>
  )
}
