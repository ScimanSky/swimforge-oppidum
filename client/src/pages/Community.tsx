import { useMemo, useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import {
  Users,
  MessageCircle,
  Droplets,
  Trophy,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AppLayout } from "@/components/AppLayout";
import MobileNav from "@/components/MobileNav";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

const tabs = [
  { id: "feed", label: "Feed" },
  { id: "challenges", label: "Sfide" },
  { id: "clubs", label: "Club" },
] as const;

type TabId = typeof tabs[number]["id"];

type FeedItem = {
  id: number;
  user_id: number;
  user_name?: string | null;
  user_email?: string | null;
  user_avatar?: string | null;
  content?: string | null;
  media_url?: string | null;
  created_at: string;
  splash_count: number;
  comment_count: number;
  has_splashed: boolean;
  activity_distance_meters?: number | null;
  activity_duration_seconds?: number | null;
  activity_date?: string | null;
  activity_source?: string | null;
  activity_stroke_type?: string | null;
  activity_is_open_water?: boolean | null;
};

export default function Community() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>("feed");
  const [scope, setScope] = useState<"global" | "self">("global");
  const [commentPostId, setCommentPostId] = useState<number | null>(null);
  const [commentText, setCommentText] = useState("");
  const [showCommentsFor, setShowCommentsFor] = useState<number | null>(null);

  const utils = trpc.useUtils();

  const feedQuery = trpc.community.feed.useQuery(
    { limit: 20, scope },
    { enabled: activeTab === "feed" }
  );

  const toggleSplash = trpc.community.toggleSplash.useMutation({
    onSuccess: () => utils.community.feed.invalidate(),
  });

  const addComment = trpc.community.addComment.useMutation({
    onSuccess: () => {
      setCommentText("");
      setCommentPostId(null);
      utils.community.feed.invalidate();
    },
  });

  const commentsQuery = trpc.community.comments.useQuery(
    { postId: showCommentsFor ?? 0 },
    { enabled: !!showCommentsFor }
  );

  const formatDistance = (meters?: number | null) => {
    if (!meters) return null;
    if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
    return `${meters} m`;
  };

  const formatTime = (seconds?: number | null) => {
    if (!seconds) return null;
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, "0")}:${secs
        .toString()
        .padStart(2, "0")}`;
    }
    return `${minutes}:${secs.toString().padStart(2, "0")}`;
  };

  const formatDate = (date?: string | null) => {
    if (!date) return "";
    return new Date(date).toLocaleDateString("it-IT", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const feedItems = useMemo(() => (feedQuery.data as FeedItem[]) || [], [feedQuery.data]);

  return (
    <AppLayout showBubbles={true} bubbleIntensity="medium" className="text-white">
      <div className="min-h-screen pb-24">
        <div className="container py-8 md:py-10">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-white">Social</h1>
              <p className="text-white/60 text-sm">Condividi i tuoi allenamenti con la community</p>
            </div>
            <div className="hidden sm:flex items-center gap-2 text-xs text-white/60">
              <Users className="h-4 w-4" />
              Social Hub
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mb-6">
            {tabs.map((tab) => (
              <Button
                key={tab.id}
                variant={activeTab === tab.id ? "default" : "outline"}
                className={
                  activeTab === tab.id
                    ? "bg-[var(--gold)] text-[var(--navy)]"
                    : "border-white/15 text-white/70 hover:text-white"
                }
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </Button>
            ))}
          </div>

          {activeTab === "feed" && (
            <div className="space-y-6">
              <Card className="bg-card/30 border-white/10">
                <CardContent className="p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-white">Condividi un allenamento</h2>
                    <p className="text-white/60 text-sm">
                      Attiva l&apos;opzione “Condividi nel feed” dalle tue attività.
                    </p>
                  </div>
                  <Link href="/activities">
                    <Button className="bg-[var(--gold)] text-[var(--navy)] hover:bg-[var(--gold-light)]">
                      Vai alle Attività
                      <ChevronRight className="h-4 w-4 ml-2" />
                    </Button>
                  </Link>
                </CardContent>
              </Card>

              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={scope === "global" ? "default" : "outline"}
                  onClick={() => setScope("global")}
                >
                  Globale
                </Button>
                <Button
                  size="sm"
                  variant={scope === "self" ? "default" : "outline"}
                  onClick={() => setScope("self")}
                >
                  I miei
                </Button>
              </div>

              {feedQuery.isLoading ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, idx) => (
                    <Card key={idx} className="bg-card/20 border-white/10">
                      <CardContent className="p-5 h-32" />
                    </Card>
                  ))}
                </div>
              ) : feedItems.length === 0 ? (
                <Card className="bg-card/20 border-white/10">
                  <CardContent className="p-6 text-center text-white/60">
                    Nessun post ancora. Condividi la tua prossima sessione!
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  {feedItems.map((post, idx) => {
                    const displayName = post.user_name || post.user_email || "Nuotatore";
                    const distance = formatDistance(post.activity_distance_meters);
                    const duration = formatTime(post.activity_duration_seconds);
                    const isOwner = user?.id === post.user_id;
                    return (
                      <motion.div
                        key={post.id}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.05 }}
                      >
                        <Card className="bg-card/20 border-white/10 overflow-hidden">
                          <CardContent className="p-5 space-y-4">
                            <div className="flex items-center gap-3">
                              {post.user_avatar ? (
                                <img
                                  src={post.user_avatar}
                                  alt={displayName}
                                  className="h-10 w-10 rounded-full object-cover"
                                />
                              ) : (
                                <div className="h-10 w-10 rounded-full bg-white/10 flex items-center justify-center">
                                  <Users className="h-5 w-5 text-white/70" />
                                </div>
                              )}
                              <div className="flex-1">
                                <div className="text-white font-semibold">{displayName}</div>
                                <div className="text-xs text-white/50">{formatDate(post.created_at)}</div>
                              </div>
                              {post.activity_source && (
                                <span className="text-xs text-white/50 uppercase tracking-wide">
                                  {post.activity_source}
                                </span>
                              )}
                            </div>

                            {post.content && (
                              <p className="text-white/80 text-sm leading-relaxed">{post.content}</p>
                            )}

                            {post.media_url && (
                              <div className="rounded-xl overflow-hidden border border-white/10">
                                <img
                                  src={post.media_url}
                                  alt="media"
                                  className="w-full max-h-96 object-cover"
                                />
                              </div>
                            )}

                            {(distance || duration) && (
                              <div className="flex flex-wrap gap-3 text-xs text-white/60">
                                {distance && <span>🏊 {distance}</span>}
                                {duration && <span>⏱ {duration}</span>}
                                {post.activity_stroke_type && (
                                  <span>• {post.activity_stroke_type}</span>
                                )}
                              </div>
                            )}

                            <div className="flex items-center gap-3">
                              <Button
                                size="sm"
                                variant={post.has_splashed ? "default" : "outline"}
                                className={post.has_splashed ? "bg-cyan-500 text-[var(--navy)]" : "border-cyan-400/40 text-cyan-200"}
                                onClick={() => toggleSplash.mutate({ postId: post.id })}
                                disabled={toggleSplash.isPending || isOwner}
                              >
                                <Droplets className="h-4 w-4 mr-2" />
                                Splash {post.splash_count}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-white/70 hover:text-white"
                                onClick={() => {
                                  setCommentPostId(commentPostId === post.id ? null : post.id);
                                  setShowCommentsFor(showCommentsFor === post.id ? null : post.id);
                                }}
                              >
                                <MessageCircle className="h-4 w-4 mr-2" />
                                Commenti {post.comment_count}
                              </Button>
                            </div>

                            {commentPostId === post.id && (
                              <div className="space-y-3">
                                {showCommentsFor === post.id && (
                                  <div className="space-y-2 text-sm text-white/80">
                                    {commentsQuery.isLoading ? (
                                      <div className="text-white/50">Caricamento commenti...</div>
                                    ) : commentsQuery.data && commentsQuery.data.length > 0 ? (
                                      commentsQuery.data.map((comment: any) => (
                                        <div key={comment.id} className="flex items-start gap-2">
                                          {comment.user_avatar ? (
                                            <img
                                              src={comment.user_avatar}
                                              alt={comment.user_name || comment.user_email}
                                              className="h-6 w-6 rounded-full object-cover"
                                            />
                                          ) : (
                                            <div className="h-6 w-6 rounded-full bg-white/10" />
                                          )}
                                          <div>
                                            <div className="text-xs text-white/60">
                                              {comment.user_name || comment.user_email}
                                            </div>
                                            <div>{comment.content}</div>
                                          </div>
                                        </div>
                                      ))
                                    ) : (
                                      <div className="text-white/50">Nessun commento ancora.</div>
                                    )}
                                  </div>
                                )}

                                <div className="flex flex-col sm:flex-row gap-2">
                                  <Input
                                    value={commentText}
                                    onChange={(e) => setCommentText(e.target.value)}
                                    placeholder="Scrivi un commento..."
                                  />
                                  <Button
                                    onClick={() => addComment.mutate({ postId: post.id, content: commentText })}
                                    disabled={addComment.isPending || commentText.trim().length === 0}
                                    className="bg-[var(--gold)] text-[var(--navy)]"
                                  >
                                    Pubblica
                                  </Button>
                                </div>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === "challenges" && (
            <div className="space-y-4">
              <Card className="bg-card/20 border-white/10">
                <CardContent className="p-6 text-white/70">
                  <div className="flex items-center gap-2 mb-3 text-white">
                    <Trophy className="h-5 w-5 text-[var(--gold)]" />
                    Sfide Social
                  </div>
                  <p>
                    Le sfide sociali vivono qui. Per ora puoi gestire le sfide attive dalla sezione dedicata.
                  </p>
                  <Link href="/challenges">
                    <Button className="mt-4 bg-[var(--gold)] text-[var(--navy)]">
                      Vai alle Sfide
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === "clubs" && (
            <div className="space-y-4">
              <Card className="bg-card/20 border-white/10">
                <CardContent className="p-6 text-white/70">
                  <div className="flex items-center gap-2 mb-3 text-white">
                    <Users className="h-5 w-5 text-cyan-400" />
                    Club & Gruppi
                  </div>
                  <p>
                    Stiamo preparando i club: pagine dedicate, feed interni e sfide private.
                    Presto potrai creare il tuo gruppo.
                  </p>
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        <MobileNav />
      </div>
    </AppLayout>
  );
}
