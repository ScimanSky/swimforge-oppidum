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
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 outline-none"
    >
      <div className="relative">
        <div
          className={cn(
            "flex items-center justify-center rounded-full p-[2.5px]",
            hasUnviewed
              ? "bg-[linear-gradient(135deg,var(--electric-cyan),var(--electric-lime))]"
              : "bg-border/60",
          )}
        >
          <Avatar className="size-14 border-2 border-background">
            {avatarUrl && <AvatarImage src={avatarUrl} alt={userName} />}
            <AvatarFallback className="text-xs font-semibold">
              {getInitials(userName)}
            </AvatarFallback>
          </Avatar>
        </div>
        {isCurrentUser && (
          <span className="absolute -bottom-0.5 -right-0.5 flex size-5 items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--electric-cyan),var(--electric-lime))] text-background shadow-sm">
            <Plus className="size-3" strokeWidth={3} />
          </span>
        )}
      </div>
      <span className="max-w-[64px] truncate text-[11px] leading-tight text-muted-foreground">
        {isCurrentUser ? "La tua" : userName.split(" ")[0]}
      </span>
    </button>
  )
}
