import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import {
  Users,
  Trophy,
  Plus,
  Droplet,
  MessageCircle,
  Share2,
  Waves,
  Clock,
  TrendingUp,
  Crown,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AppLayout } from "@/components/AppLayout";
import MobileNav from "@/components/MobileNav";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

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
};

type ClubItem = {
  id: number;
  name: string;
  description?: string | null;
  cover_image_url?: string | null;
  is_private: boolean;
  owner_id: number;
  created_at: string;
  member_count: number;
  is_member: boolean;
  member_role?: string | null;
};

export default function Community() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("feed");
  const [scope, setScope] = useState<"global" | "self">("global");
  const [openCommentsId, setOpenCommentsId] = useState<number | null>(null);
  const [commentTextByPost, setCommentTextByPost] = useState<Record<number, string>>({});
  const commentsEndRef = useRef<HTMLDivElement | null>(null);
  const [clubScope, setClubScope] = useState<"all" | "mine">("all");
  const [clubSearch, setClubSearch] = useState("");
  const [showCreateClub, setShowCreateClub] = useState(false);
  const [clubName, setClubName] = useState("");
  const [clubDescription, setClubDescription] = useState("");

  const utils = trpc.useUtils();

  const feedQuery = trpc.community.feed.useQuery(
    { limit: 20, scope },
    { enabled: activeTab === "feed" }
  );

  const toggleSplash = trpc.community.toggleSplash.useMutation({
    onSuccess: () => utils.community.feed.invalidate(),
  });

  const addComment = trpc.community.addComment.useMutation({
    onSuccess: (_data, variables) => {
      setCommentTextByPost((prev) => ({ ...prev, [variables.postId]: "" }));
      setOpenCommentsId(variables.postId);
      utils.community.feed.invalidate();
      utils.community.comments.invalidate({ postId: variables.postId });
    },
  });

  const commentsQuery = trpc.community.comments.useQuery(
    { postId: openCommentsId ?? 0 },
    { enabled: !!openCommentsId }
  );

  useEffect(() => {
    if (openCommentsId && commentsQuery.data && commentsEndRef.current) {
      commentsEndRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [openCommentsId, commentsQuery.data]);

  const clubsQuery = trpc.community.clubs.list.useQuery(
    { scope: clubScope, search: clubSearch.trim() || undefined, limit: 50 },
    { enabled: activeTab === "clubs" }
  );

  const createClub = trpc.community.clubs.create.useMutation({
    onSuccess: () => {
      setClubName("");
      setClubDescription("");
      setShowCreateClub(false);
      utils.community.clubs.list.invalidate();
    },
  });

  const joinClub = trpc.community.clubs.join.useMutation({
    onSuccess: () => utils.community.clubs.list.invalidate(),
  });

  const leaveClub = trpc.community.clubs.leave.useMutation({
    onSuccess: () => utils.community.clubs.list.invalidate(),
  });

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
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatPace = (meters?: number | null, seconds?: number | null) => {
    if (!meters || !seconds || meters <= 0) return null;
    const per100 = seconds / (meters / 100);
    const m = Math.floor(per100 / 60);
    const s = Math.round(per100 % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const feedItems = useMemo(() => (feedQuery.data as FeedItem[]) || [], [feedQuery.data]);
  const clubItems = useMemo(() => (clubsQuery.data as ClubItem[]) || [], [clubsQuery.data]);

  return (
    <AppLayout showBubbles={true} bubbleIntensity="medium" className="text-white">
      <div className="min-h-screen pb-24">
        {/* Hero */}
        <section className="relative py-16 bg-gradient-to-b from-[var(--navy)] to-background overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-1/4 w-72 h-72 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="container relative z-10">
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="text-center"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 200, delay: 0.2 }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--azure)]/10 border border-[var(--azure)]/20 mb-6 backdrop-blur-sm"
              >
                <Users className="h-4 w-4 text-[var(--azure)]" />
                <span className="text-sm font-semibold text-[var(--azure)]">Club Hub</span>
              </motion.div>
              <h1 className="text-5xl md:text-6xl font-bold text-white mb-4 bg-gradient-to-r from-white via-cyan-200 to-white bg-clip-text text-transparent">
                Club
              </h1>
              <p className="text-xl text-white/70 max-w-2xl mx-auto">
                Condividi i tuoi allenamenti, ricevi Splash dai compagni e sfida gli amici in Shadow Racing
              </p>
            </motion.div>
          </div>
        </section>

        {/* Main Content */}
        <section className="py-12">
          <div className="container">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-3 mb-8">
                <TabsTrigger value="feed" className="flex items-center gap-2">
                  <Waves className="h-4 w-4" />
                  <span>Feed Sociale</span>
                </TabsTrigger>
                <TabsTrigger value="clubs" className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  <span>Club</span>
                </TabsTrigger>
                <TabsTrigger value="racing" className="flex items-center gap-2">
                  <Trophy className="h-4 w-4" />
                  <span>Shadow Racing</span>
                </TabsTrigger>
              </TabsList>

              {/* FEED TAB */}
              <TabsContent value="feed" className="space-y-6">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                  <h2 className="text-2xl font-bold">Feed Recente</h2>
                  <Link href="/activities">
                    <Button className="bg-[var(--gold)] hover:bg-[var(--gold-light)] text-[var(--navy)] font-semibold">
                      <Plus className="h-4 w-4 mr-2" />
                      Condividi Sessione
                    </Button>
                  </Link>
                </div>

                <div className="flex gap-3 mb-6">
                  {(["global", "self"] as const).map((f) => (
                    <Button
                      key={f}
                      variant={scope === f ? "default" : "outline"}
                      onClick={() => setScope(f)}
                      className={scope === f ? "bg-[var(--azure)]" : ""}
                    >
                      {f === "global" ? "Tutti" : "I miei"}
                    </Button>
                  ))}
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
                  <div className="grid gap-6">
                    {feedItems.map((post, index) => {
                      const displayName = post.user_name || post.user_email || "Nuotatore";
                      const distance = formatDistance(post.activity_distance_meters);
                      const duration = formatTime(post.activity_duration_seconds);
                      const pace = formatPace(post.activity_distance_meters, post.activity_duration_seconds);
                      const isOwner = user?.id === post.user_id;

                      return (
                        <motion.div
                          key={post.id}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.5, delay: index * 0.05 }}
                        >
                          <Card className="border-border/50 bg-card/50 backdrop-blur-sm hover:bg-card/80 transition-all overflow-hidden">
                            <CardContent className="p-6">
                              <div className="flex items-start gap-4 mb-4">
                                {post.user_avatar ? (
                                  <img
                                    src={post.user_avatar}
                                    alt={displayName}
                                    className="w-12 h-12 rounded-full border-2 border-[var(--azure)] object-cover"
                                  />
                                ) : (
                                  <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center">
                                    <Users className="h-5 w-5 text-white/70" />
                                  </div>
                                )}
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <h3 className="font-bold text-lg text-foreground">{displayName}</h3>
                                    {post.activity_source && (
                                      <span className="px-2 py-1 rounded-full bg-[var(--gold)]/10 text-[var(--gold)] text-xs font-semibold uppercase">
                                        {post.activity_source}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-sm text-muted-foreground">
                                    {formatDate(post.created_at)}
                                  </p>
                                </div>
                              </div>

                              <h2 className="text-xl font-bold text-foreground mb-2">
                                {post.content || "Allenamento"}
                              </h2>

                              {post.media_url && (
                                <img
                                  src={post.media_url}
                                  alt={post.content || "Allenamento"}
                                  className="w-full h-64 object-cover rounded-lg mb-4"
                                />
                              )}

                              {(distance || duration || pace) && (
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6 p-4 rounded-lg bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border border-cyan-500/20">
                                  {distance && (
                                    <div className="text-center">
                                      <div className="text-2xl font-bold text-[var(--azure)]">{distance}</div>
                                      <div className="text-xs text-muted-foreground">Distanza</div>
                                    </div>
                                  )}
                                  {duration && (
                                    <div className="text-center">
                                      <div className="text-2xl font-bold text-[var(--azure)]">{duration}</div>
                                      <div className="text-xs text-muted-foreground">Tempo</div>
                                    </div>
                                  )}
                                  {pace && (
                                    <div className="text-center">
                                      <div className="text-2xl font-bold text-[var(--gold)]">{pace}</div>
                                      <div className="text-xs text-muted-foreground">/100m</div>
                                    </div>
                                  )}
                                  {post.activity_stroke_type && (
                                    <div className="text-center">
                                      <div className="text-2xl font-bold text-purple-400">{post.activity_stroke_type}</div>
                                      <div className="text-xs text-muted-foreground">Stile</div>
                                    </div>
                                  )}
                                </div>
                              )}

                              <div className="flex gap-3 mb-4">
                                <motion.button
                                  whileHover={{ scale: 1.05 }}
                                  whileTap={{ scale: 0.95 }}
                                  onClick={() => toggleSplash.mutate({ postId: post.id })}
                                  disabled={toggleSplash.isPending || isOwner}
                                  className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg font-semibold transition-all ${
                                    post.has_splashed
                                      ? "bg-[var(--azure)]/20 text-[var(--azure)] border border-[var(--azure)]/50"
                                      : "bg-transparent text-muted-foreground border border-border/50 hover:border-[var(--azure)]/50"
                                  }`}
                                >
                                  <Droplet className="h-5 w-5" />
                                  <span>Splash {post.splash_count > 0 ? `(${post.splash_count})` : ""}</span>
                                </motion.button>

                                <Button
                                  variant="outline"
                                  className="flex-1 flex items-center justify-center gap-2"
                                  onClick={() => {
                                    setOpenCommentsId(openCommentsId === post.id ? null : post.id);
                                  }}
                                >
                                  <MessageCircle className="h-5 w-5" />
                                  <span>Commenti</span>
                                  {post.comment_count > 0 && (
                                    <span className="ml-1 inline-flex items-center justify-center min-w-[22px] h-5 px-2 rounded-full bg-[var(--azure)]/20 text-[var(--azure)] text-xs font-semibold">
                                      {post.comment_count}
                                    </span>
                                  )}
                                </Button>

                                <Button variant="outline" className="flex-1 flex items-center justify-center gap-2">
                                  <Share2 className="h-5 w-5" />
                                  <span>Condividi</span>
                                </Button>
                              </div>

                              {openCommentsId === post.id && (
                                <div className="space-y-3">
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

                                  <div className="flex flex-col sm:flex-row gap-2">
                                    <Input
                                      value={commentTextByPost[post.id] ?? ""}
                                      onChange={(e) =>
                                        setCommentTextByPost((prev) => ({ ...prev, [post.id]: e.target.value }))
                                      }
                                      placeholder="Scrivi un commento..."
                                    />
                                    <Button
                                      onClick={() =>
                                        addComment.mutate({
                                          postId: post.id,
                                          content: (commentTextByPost[post.id] ?? "").trim(),
                                        })
                                      }
                                      disabled={addComment.isPending || (commentTextByPost[post.id] ?? "").trim().length === 0}
                                      className="bg-[var(--gold)] text-[var(--navy)]"
                                    >
                                      Pubblica
                                    </Button>
                                  </div>
                                  <div ref={commentsEndRef} />
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </TabsContent>

              {/* CLUBS TAB */}
              <TabsContent value="clubs" className="space-y-6">
                <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
                  <CardContent className="p-6">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="flex items-center gap-2">
                        <Users className="h-5 w-5 text-[var(--azure)]" />
                        <div>
                          <h2 className="text-xl font-semibold text-foreground">Club</h2>
                          <p className="text-sm text-white/60">Entra in squadre locali o crea il tuo team.</p>
                        </div>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <Input
                          placeholder="Cerca club..."
                          value={clubSearch}
                          onChange={(e) => setClubSearch(e.target.value)}
                          className="bg-white/5 border-white/10"
                        />
                        <Button
                          className="bg-[var(--gold)] text-[var(--navy)]"
                          onClick={() => setShowCreateClub((prev) => !prev)}
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Crea Club
                        </Button>
                      </div>
                    </div>

                    {showCreateClub && (
                      <div className="mt-4 rounded-xl border border-[var(--gold)]/30 bg-[var(--navy)]/40 p-4">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <Input
                            placeholder="Nome club"
                            value={clubName}
                            onChange={(e) => setClubName(e.target.value)}
                          />
                          <Input
                            placeholder="Descrizione (opzionale)"
                            value={clubDescription}
                            onChange={(e) => setClubDescription(e.target.value)}
                          />
                        </div>
                        <div className="mt-3 flex gap-2">
                          <Button
                            className="bg-[var(--azure)] text-white"
                            onClick={() =>
                              createClub.mutate({
                                name: clubName.trim(),
                                description: clubDescription.trim() || null,
                              })
                            }
                            disabled={createClub.isPending || clubName.trim().length < 3}
                          >
                            Crea ora
                          </Button>
                          <Button variant="outline" onClick={() => setShowCreateClub(false)}>
                            Annulla
                          </Button>
                        </div>
                      </div>
                    )}

                    <div className="mt-6 flex gap-2">
                      {(["all", "mine"] as const).map((scopeOption) => (
                        <Button
                          key={scopeOption}
                          variant={clubScope === scopeOption ? "default" : "outline"}
                          onClick={() => setClubScope(scopeOption)}
                          className={clubScope === scopeOption ? "bg-[var(--azure)]" : ""}
                        >
                          {scopeOption === "all" ? "Esplora" : "I miei"}
                        </Button>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {clubsQuery.isLoading ? (
                  <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
                    <CardContent className="p-6 text-white/60">Caricamento club...</CardContent>
                  </Card>
                ) : clubItems.length === 0 ? (
                  <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
                    <CardContent className="p-6 text-white/60">
                      Nessun club trovato. Creane uno o cambia filtro.
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                    {clubItems.map((club) => {
                      const isOwner = club.member_role === "owner";
                      return (
                        <Card key={club.id} className="border-border/50 bg-card/60 backdrop-blur-sm overflow-hidden">
                          <div className="h-28 bg-gradient-to-r from-[var(--navy)] to-[var(--azure)]/30 relative">
                            {club.cover_image_url ? (
                              <img
                                src={club.cover_image_url}
                                alt={club.name}
                                className="absolute inset-0 h-full w-full object-cover opacity-70"
                              />
                            ) : (
                              <div className="absolute inset-0 bg-[var(--navy)]/50" />
                            )}
                          </div>
                          <CardContent className="p-5 space-y-3">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <h3 className="text-lg font-semibold">{club.name}</h3>
                                <p className="text-sm text-white/60 line-clamp-2">
                                  {club.description || "Club in crescita. Unisciti e porta energia!"}
                                </p>
                              </div>
                              {isOwner && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--gold)]/20 px-2 py-1 text-xs text-[var(--gold)]">
                                  <Crown className="h-3 w-3" />
                                  Owner
                                </span>
                              )}
                            </div>
                            <div className="flex items-center justify-between text-sm text-white/70">
                              <span>{club.member_count} membri</span>
                              <span>{club.is_private ? "Privato" : "Pubblico"}</span>
                            </div>
                            <div className="flex gap-2">
                              {club.is_member ? (
                                <Button
                                  variant="outline"
                                  className="w-full"
                                  onClick={() => leaveClub.mutate({ clubId: club.id })}
                                >
                                  Lascia
                                </Button>
                              ) : (
                                <Button
                                  className="w-full bg-[var(--azure)] text-white"
                                  onClick={() => joinClub.mutate({ clubId: club.id })}
                                >
                                  Entra
                                </Button>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </TabsContent>

              {/* SHADOW RACING TAB */}
              <TabsContent value="racing" className="space-y-6">
                <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
                  <CardContent className="p-6 text-muted-foreground">
                    <div className="flex items-center gap-2 mb-3 text-foreground">
                      <Trophy className="h-5 w-5 text-[var(--gold)]" />
                      Shadow Racing
                    </div>
                    <p>
                      Modalità competitiva in arrivo: confronta le tue sessioni con quelle degli amici e scala la classifica.
                    </p>
                    <div className="mt-4 flex items-center gap-2 text-sm text-white/60">
                      <TrendingUp className="h-4 w-4 text-[var(--azure)]" />
                      Leaderboard + storico sfide saranno qui.
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </section>

        <MobileNav />
      </div>
    </AppLayout>
  );
}
