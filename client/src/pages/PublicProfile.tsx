"use client"

import AppLayout from "@/components/AppLayout"
import { Surface, SurfaceContent } from "@/components/ui/surface"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { MetricOrb } from "@/components/metrics/MetricOrb"
import { trpc } from "@/lib/trpc"
import { useMemo } from "react"
import { useParams, Link } from "wouter"
import { UserPlus, UserCheck, ArrowLeft, MapPin, Zap } from "lucide-react"

const getInitials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "SF"

export default function PublicProfile() {
  const params = useParams<{ id: string }>()
  const userId = Number.parseInt(params.id || "0", 10)

  const meQuery = trpc.auth.me.useQuery()
  const profileQuery = trpc.community.users.getPublicProfile.useQuery(
    { userId },
    { enabled: Number.isFinite(userId) && userId > 0 }
  )

  const toggleFollowMutation = trpc.community.users.toggleFollow.useMutation({
    onSuccess: () => profileQuery.refetch(),
  })

  const isSelf = (meQuery.data?.id ?? 0) === userId

  const displayName = useMemo(() => {
    const p: any = profileQuery.data
    return (p?.name as string) || (p?.username as string) || "Nuotatore"
  }, [profileQuery.data])

  const avatarUrl = useMemo(() => {
    const p: any = profileQuery.data
    return (p?.avatarUrl as string) || (p?.avatar_url as string) || ""
  }, [profileQuery.data])

  const coverUrl = useMemo(() => {
    const p: any = profileQuery.data
    return (p?.coverUrl as string) || (p?.cover_url as string) || ""
  }, [profileQuery.data])

  const bio = ((profileQuery.data as any)?.bio as string) || ""
  const location = ((profileQuery.data as any)?.location as string) || ""
  const level = Number((profileQuery.data as any)?.level ?? 1)
  const totalXp = Number((profileQuery.data as any)?.totalXp ?? 0)
  const followerCount = Number((profileQuery.data as any)?.followerCount ?? 0)
  const followingCount = Number((profileQuery.data as any)?.followingCount ?? 0)
  const isFollowing = Boolean((profileQuery.data as any)?.isFollowing)

  return (
    <AppLayout>
      <div className="space-y-6 lg:space-y-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost-neon" size="icon" asChild>
            <Link href="/challenges">
              <ArrowLeft className="size-5" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-display font-bold neon-gradient-text">Profilo pubblico</h1>
            <p className="text-muted-foreground text-sm">Scopri e segui altri nuotatori.</p>
          </div>
        </div>

        {profileQuery.isLoading ? (
          <Surface className="bg-card border-border glass-panel">
            <SurfaceContent className="p-6 text-muted-foreground">Caricamento profilo...</SurfaceContent>
          </Surface>
        ) : profileQuery.isError ? (
          <Surface className="bg-card border-border glass-panel">
            <SurfaceContent className="p-6">
              <p className="text-foreground font-medium">Impossibile caricare il profilo</p>
              <p className="text-muted-foreground text-sm mt-1">{profileQuery.error.message}</p>
            </SurfaceContent>
          </Surface>
        ) : !profileQuery.data ? (
          <Surface className="bg-card border-border glass-panel">
            <SurfaceContent className="p-6 text-muted-foreground">Profilo non trovato.</SurfaceContent>
          </Surface>
        ) : (
          <Surface className="bg-card border-border glass-panel overflow-hidden">
            <div className="relative h-40 bg-muted">
              {coverUrl ? (
                <img src={coverUrl} alt="Cover profilo" className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full bg-gradient-to-br from-primary/25 via-background/60 to-accent/15" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-card/80 to-transparent" />
            </div>
            <SurfaceContent className="p-6">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-center gap-4">
                  <Avatar className="size-20 border border-border">
                    <AvatarImage src={avatarUrl || ""} alt={displayName} />
                    <AvatarFallback className="text-xl">{getInitials(displayName)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-display font-bold text-foreground">{displayName}</h2>
                      <Badge variant="neon" className="gap-1">
                        <Zap className="size-3" />
                        Livello {Number.isFinite(level) ? level : 1}
                      </Badge>
                      <Badge variant="outline" className="border-primary/40 text-primary">
                        {totalXp.toLocaleString()} XP
                      </Badge>
                    </div>
                    {location ? (
                      <p className="mt-1 text-sm text-muted-foreground flex items-center gap-1">
                        <MapPin className="size-4" />
                        {location}
                      </p>
                    ) : null}
                  </div>
                </div>

                {!isSelf ? (
                  <Button
                    variant={isFollowing ? "outline-neon" : "neon"}
                    className="gap-2"
                    onClick={() => toggleFollowMutation.mutate({ userId })}
                    disabled={toggleFollowMutation.isPending}
                  >
                    {isFollowing ? <UserCheck className="size-4" /> : <UserPlus className="size-4" />}
                    {isFollowing ? "Seguito" : "Segui"}
                  </Button>
                ) : null}
              </div>

              {bio ? <p className="mt-4 text-foreground">{bio}</p> : null}

              <div className="mt-5 grid grid-cols-2 gap-4 sm:max-w-md">
                <MetricOrb
                  label="Following"
                  value={followingCount}
                  progress={Math.min(100, Math.round((followingCount / 400) * 100))}
                  helper="Profili seguiti"
                  icon={<UserCheck className="size-4" />}
                  tone="cyan"
                  size="sm"
                />
                <MetricOrb
                  label="Follower"
                  value={followerCount}
                  progress={Math.min(100, Math.round((followerCount / 400) * 100))}
                  helper="Crescita community"
                  icon={<UserPlus className="size-4" />}
                  tone="lime"
                  size="sm"
                />
              </div>
            </SurfaceContent>
          </Surface>
        )}
      </div>
    </AppLayout>
  )
}
