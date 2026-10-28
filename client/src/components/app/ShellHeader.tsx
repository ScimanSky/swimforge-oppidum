import { Link, useLocation } from "wouter"
import { ChevronDown, ChevronLeft, Droplet, LogOut, Settings, Shield, User } from "lucide-react"

import { canGoBackInApp } from "@/lib/in-app-history"
import { FEED_PATH, TODAY_PATH, normalizePath, pageTitleForPath, parentPathForPath } from "@/lib/navigation"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import NotificationBell from "@/components/NotificationBell"
import DirectMessages from "@/components/DirectMessages"

function Brand() {
  return (
    <span className="inline-flex items-center gap-2">
      <Droplet className="size-6 fill-current text-action-text" aria-hidden />
      <span className="font-display text-[26px] font-bold leading-none text-foreground">SwimForge</span>
    </span>
  )
}

function initialsFromName(nameOrEmail: string) {
  const parts = nameOrEmail
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean)
  if (parts.length === 0) return "SF"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase()
}

export type ShellHeaderProps = {
  homePath: string
  profileLabel: string
  avatarUrl?: string
  isAdmin: boolean
  isLoggingOut: boolean
  onLogout: () => void
}

/** Back button on detail pages, page title (brand on the feed), notifications, messages, avatar menu. */
export function ShellHeader({ homePath, profileLabel, avatarUrl, isAdmin, isLoggingOut, onLogout }: ShellHeaderProps) {
  const [location, navigate] = useLocation()
  const path = normalizePath(location)
  const parentPath = parentPathForPath(path)
  const pageTitle = pageTitleForPath(path)

  const goBack = () => {
    if (canGoBackInApp()) window.history.back()
    else if (parentPath) navigate(parentPath, { replace: true })
  }

  return (
    <header className="fixed inset-x-0 top-0 z-50 h-16 border-b border-border bg-background">
      <div className="flex h-full items-center gap-2 px-4 md:px-6">
        {/* Desktop: brand above the rail (224px + gap + gutter = rail width + gutter). */}
        <Link
          href={homePath}
          aria-label={homePath === TODAY_PATH ? "SwimForge, vai a Oggi" : "SwimForge, vai al feed"}
          className="hidden w-[224px] shrink-0 lg:inline-flex">
          <Brand />
        </Link>

        <div className="flex min-w-0 flex-1 items-center gap-1">
          {parentPath ? (
            <Button type="button" variant="ghost" size="icon" onClick={goBack} aria-label="Indietro" className="-ml-2 shrink-0">
              <ChevronLeft className="size-6" />
            </Button>
          ) : null}
          {path === FEED_PATH ? (
            <h1 className="min-w-0">
              <span className="lg:hidden">
                <Brand />
              </span>
              <span className="hidden font-display text-[26px] font-bold leading-none lg:inline">{pageTitle}</span>
            </h1>
          ) : (
            <h1 className="min-w-0 truncate font-display text-[26px] font-bold leading-none">{pageTitle}</h1>
          )}
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1">
          <NotificationBell />
          <DirectMessages mode="link" />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="gap-2 px-1.5" aria-label="Menu del profilo">
                <Avatar className="size-8 border border-border">
                  <AvatarImage src={avatarUrl} alt={profileLabel} />
                  <AvatarFallback>{initialsFromName(profileLabel)}</AvatarFallback>
                </Avatar>
                <span className="hidden max-w-[140px] truncate text-sm md:inline">{profileLabel}</span>
                <ChevronDown className="hidden size-4 text-muted-foreground md:inline" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel className="truncate">{profileLabel}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/profile" className="flex items-center gap-2">
                  <User className="size-4" />
                  Profilo
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/settings" className="flex items-center gap-2">
                  <Settings className="size-4" />
                  Impostazioni
                </Link>
              </DropdownMenuItem>
              {isAdmin && (
                <DropdownMenuItem asChild>
                  <Link href="/admin/reports" className="flex items-center gap-2">
                    <Shield className="size-4" />
                    Moderazione
                  </Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={onLogout}>
                <LogOut className="size-4" />
                {isLoggingOut ? "Uscita…" : "Esci"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
}
