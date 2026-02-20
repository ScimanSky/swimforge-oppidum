"use client"

import { cn } from "@/lib/utils"
import { getInitials } from "@/lib/format"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Plus } from "lucide-react"

interface StoryAvatarProps {
  userId: number
  userName: string
  avatarUrl?: string | null
  hasUnviewed: boolean
  hasStories?: boolean
  isCurrentUser?: boolean
  size?: "sm" | "default"
  showLabel?: boolean
  onClick?: () => void
}

export function StoryAvatar({
  userName,
  avatarUrl,
  hasUnviewed,
  hasStories,
  isCurrentUser,
  size = "default",
  showLabel,
  onClick,
}: StoryAvatarProps) {
  const currentUserHasStories = isCurrentUser ? (hasStories ?? hasUnviewed) : hasUnviewed
  const showAddOverlay = isCurrentUser && !currentUserHasStories
  const isSmall = size === "sm"

  const shouldShowLabel = showLabel ?? !isSmall

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("flex flex-col items-center outline-none group", shouldShowLabel && "gap-1")}
    >
      <div className="relative">
        <div
          className={cn(
            "flex items-center justify-center rounded-full transition-transform duration-200 group-hover:scale-105 group-active:scale-95",
            isSmall ? "p-[2px]" : "p-[3px]",
            hasUnviewed
              ? "story-ring-animated"
              : "bg-border/40",
          )}
        >
          <Avatar className={cn(
            "border-background",
            isSmall ? "size-10 border-2" : "size-16 border-[3px]",
            showAddOverlay && "opacity-60",
          )}>
            {avatarUrl && <AvatarImage src={avatarUrl} alt={userName} />}
            <AvatarFallback className={cn("font-semibold", isSmall ? "text-xs" : "text-sm")}>
              {getInitials(userName)}
            </AvatarFallback>
          </Avatar>
        </div>

        {/* "+" overlay for creating story */}
        {isCurrentUser && (
          <span className={cn(
            "absolute flex items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--electric-cyan),var(--electric-lime))] text-background shadow-md",
            showAddOverlay
              ? isSmall ? "inset-0 m-auto size-6 rounded-full" : "inset-0 m-auto size-8 rounded-full"
              : isSmall ? "-bottom-0.5 -right-0.5 size-4" : "-bottom-0.5 -right-0.5 size-5"
          )}>
            <Plus className={showAddOverlay ? (isSmall ? "size-3.5" : "size-5") : (isSmall ? "size-2.5" : "size-3")} strokeWidth={3} />
          </span>
        )}
      </div>
      {shouldShowLabel && (
        <span className={cn(
          "truncate font-medium leading-tight text-muted-foreground",
          isSmall ? "max-w-[56px] text-[10px]" : "max-w-[68px] text-xs",
        )}>
          {isCurrentUser ? "La tua" : userName.split(" ")[0]}
        </span>
      )}
    </button>
  )
}
