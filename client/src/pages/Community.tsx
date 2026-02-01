"use client"

import AppLayout from "@/components/AppLayout"
import { useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Droplet,
  MessageCircle,
  Heart,
  Users,
  Trophy,
  ChevronRight,
  MapPin,
  Clock,
  Plus,
} from "lucide-react"

const feedPosts = [
  {
    id: 1,
    user: {
      name: "Marcus Rivera",
      avatar: "/images/athlete-2.jpg",
      initials: "MR",
      level: 35,
    },
    activity: {
      title: "Morning Sprint Session",
      type: "Pool",
      distance: "3.2 km",
      duration: "48 min",
      pace: "1:30/100m",
    },
    content: "New personal best on 100m freestyle! Feeling strong today.",
    splashes: 24,
    comments: 8,
    time: "2 hours ago",
  },
  {
    id: 2,
    user: {
      name: "Emma Thompson",
      avatar: "/images/athlete-3.jpg",
      initials: "ET",
      level: 58,
    },
    activity: {
      title: "Coastal Adventure",
      type: "Open Water",
      distance: "4.5 km",
      duration: "1h 15min",
      pace: "1:40/100m",
    },
    content: "Amazing sunrise swim along the coast. The water was perfect!",
    splashes: 42,
    comments: 15,
    time: "5 hours ago",
  },
  {
    id: 3,
    user: {
      name: "James Chen",
      avatar: "/images/athlete-1.jpg",
      initials: "JC",
      level: 28,
    },
    activity: {
      title: "Recovery Swim",
      type: "Pool",
      distance: "1.5 km",
      duration: "30 min",
      pace: "2:00/100m",
    },
    content: "Easy recovery session after yesterday&apos;s intense workout.",
    splashes: 12,
    comments: 3,
    time: "Yesterday",
  },
]

const clubs = [
  {
    id: 1,
    name: "Bay Area Masters",
    members: 234,
    image: "/images/pool-lanes.jpg",
    category: "Masters",
  },
  {
    id: 2,
    name: "Open Water Warriors",
    members: 156,
    image: "/images/open-water.jpg",
    category: "Open Water",
  },
  {
    id: 3,
    name: "Sprint Squad",
    members: 89,
    image: "/images/hero-swimmer.jpg",
    category: "Competition",
  },
]

const challenges = [
  {
    id: 1,
    title: "February Distance Challenge",
    description: "Swim 50km this month",
    participants: 1234,
    progress: 68,
    endsIn: "12 days",
    reward: "500 XP",
  },
  {
    id: 2,
    title: "Early Bird Week",
    description: "Complete 5 swims before 7 AM",
    participants: 456,
    progress: 40,
    endsIn: "5 days",
    reward: "250 XP",
  },
]

export default function Community() {
  const [likedPosts, setLikedPosts] = useState<number[]>([])

  const toggleLike = (postId: number) => {
    setLikedPosts((prev) =>
      prev.includes(postId)
        ? prev.filter((id) => id !== postId)
        : [...prev, postId]
    )
  }

  return (
    <AppLayout>
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl lg:text-3xl font-display font-bold text-foreground">
            Community
          </h1>
          <p className="text-muted-foreground mt-1">
            Connect with swimmers around the world
          </p>
        </div>
      </div>

      <Tabs defaultValue="feed" className="space-y-6">
        <TabsList className="bg-secondary/50">
          <TabsTrigger value="feed">Feed</TabsTrigger>
          <TabsTrigger value="clubs">Clubs</TabsTrigger>
          <TabsTrigger value="challenges">Challenges</TabsTrigger>
        </TabsList>

        {/* Feed Tab */}
        <TabsContent value="feed" className="space-y-4">
          {feedPosts.map((post) => (
            <Card key={post.id} className="bg-card border-border">
              <CardContent className="p-4">
                {/* Post Header */}
                <div className="flex items-start gap-3 mb-4">
                  <Avatar className="w-10 h-10">
                    <AvatarImage src={post.user.avatar || "/placeholder.svg"} alt={post.user.name} />
                    <AvatarFallback>{post.user.initials}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">
                        {post.user.name}
                      </span>
                      <Badge variant="secondary" className="text-xs">
                        Lv.{post.user.level}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{post.time}</p>
                  </div>
                </div>

                {/* Activity Card */}
                <div className="p-4 rounded-xl bg-secondary/30 mb-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-medium text-foreground">
                      {post.activity.title}
                    </h4>
                    <Badge
                      variant="secondary"
                      className={`text-xs ${
                        post.activity.type === "Pool"
                          ? "bg-primary/20 text-primary"
                          : "bg-accent/20 text-accent"
                      }`}
                    >
                      {post.activity.type}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-lg font-display font-bold text-foreground">
                        {post.activity.distance}
                      </p>
                      <p className="text-xs text-muted-foreground">Distance</p>
                    </div>
                    <div>
                      <p className="text-lg font-display font-bold text-foreground">
                        {post.activity.duration}
                      </p>
                      <p className="text-xs text-muted-foreground">Duration</p>
                    </div>
                    <div>
                      <p className="text-lg font-display font-bold text-foreground">
                        {post.activity.pace}
                      </p>
                      <p className="text-xs text-muted-foreground">Pace</p>
                    </div>
                  </div>
                </div>

                {/* Post Content */}
                <p className="text-sm text-foreground mb-4">{post.content}</p>

                {/* Post Actions */}
                <div className="flex items-center gap-4 pt-4 border-t border-border">
                  <button
                    onClick={() => toggleLike(post.id)}
                    className={`flex items-center gap-1.5 text-sm transition-colors ${
                      likedPosts.includes(post.id)
                        ? "text-primary"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Droplet
                      className={`w-4 h-4 ${
                        likedPosts.includes(post.id) ? "fill-primary" : ""
                      }`}
                    />
                    <span>
                      {post.splashes + (likedPosts.includes(post.id) ? 1 : 0)} Splashes
                    </span>
                  </button>
                  <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
                    <MessageCircle className="w-4 h-4" />
                    <span>{post.comments} Comments</span>
                  </button>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* Clubs Tab */}
        <TabsContent value="clubs" className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-display font-bold text-foreground">
              Discover Clubs
            </h2>
            <Button variant="outline" size="sm">
              <Plus className="w-4 h-4 mr-2" />
              Create Club
            </Button>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {clubs.map((club) => (
              <Card
                key={club.id}
                className="bg-card border-border overflow-hidden group hover:border-primary/50 transition-all"
              >
                <div className="relative h-32">
                  <Image
                    src={club.image || "/placeholder.svg"}
                    alt={club.name}
                    fill
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent" />
                  <Badge className="absolute top-3 left-3 bg-secondary/80 text-secondary-foreground">
                    {club.category}
                  </Badge>
                </div>
                <CardContent className="p-4">
                  <h3 className="font-semibold text-foreground mb-2">{club.name}</h3>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Users className="w-4 h-4" />
                      <span>{club.members} members</span>
                    </div>
                    <Button size="sm">Join</Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Challenges Tab */}
        <TabsContent value="challenges" className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-display font-bold text-foreground">
              Active Challenges
            </h2>
            <Button variant="outline" size="sm">
              View All
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {challenges.map((challenge) => (
              <Card key={challenge.id} className="bg-card border-border">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-12 h-12 rounded-xl bg-chart-4/10 flex items-center justify-center">
                      <Trophy className="w-6 h-6 text-chart-4" />
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {challenge.reward}
                    </Badge>
                  </div>

                  <h3 className="text-lg font-semibold text-foreground mb-1">
                    {challenge.title}
                  </h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    {challenge.description}
                  </p>

                  {/* Progress Bar */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between text-xs mb-2">
                      <span className="text-muted-foreground">Your Progress</span>
                      <span className="text-foreground font-medium">
                        {challenge.progress}%
                      </span>
                    </div>
                    <div className="h-2 bg-secondary rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{ width: `${challenge.progress}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Users className="w-4 h-4" />
                      <span>{challenge.participants} participants</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Clock className="w-4 h-4" />
                      <span>{challenge.endsIn}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
    </AppLayout>
  )
}