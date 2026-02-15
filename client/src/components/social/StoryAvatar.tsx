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
  isCurrentUser?: boolean
  onClick?: () => void
}

export function StoryAvatar({
  userName,
  avatarUrl,
  hasUnviewed,
  isCurrentUser,
  onClick,
}: StoryAvatarProps) {
  const showAddOverlay = isCurrentUser && !hasUnviewed

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 outline-none group"
    >
      <div className="relative">
        <div
          className={cn(
            "flex items-center justify-center rounded-full p-[3px] transition-transform duration-200 group-hover:scale-105 group-active:scale-95",
            hasUnviewed
              ? "story-ring-animated"
              : "bg-border/40",
          )}
        >
          <Avatar className={cn("size-16 border-[3px] border-background", showAddOverlay && "opacity-60")}>
            {avatarUrl && <AvatarImage src={avatarUrl} alt={userName} />}
            <AvatarFallback className="text-sm font-semibold">
              {getInitials(userName)}
            </AvatarFallback>
          </Avatar>
        </div>

        {/* "+" overlay for creating story */}
        {isCurrentUser && (
          <span className={cn(
            "absolute flex items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--electric-cyan),var(--electric-lime))] text-background shadow-md",
            showAddOverlay
              ? "inset-0 m-auto size-8 rounded-full"
              : "-bottom-0.5 -right-0.5 size-5"
          )}>
            <Plus className={showAddOverlay ? "size-5" : "size-3"} strokeWidth={3} />
          </span>
        )}
      </div>
      <span className="max-w-[68px] truncate text-xs font-medium leading-tight text-muted-foreground">
        {isCurrentUser ? "La tua" : userName.split(" ")[0]}
      </span>
    </button>
  )
}
