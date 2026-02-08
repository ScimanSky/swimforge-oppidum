import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useRoute } from "wouter";
import { motion } from "framer-motion";
import { 
  Users, 
  ArrowLeft, 
  Droplet, 
  MessageCircle, 
  Share2, 
  Plus,
  Calendar,
  Image as ImageIcon,
  Megaphone,
  BarChart3,
  Pin,
  Trash2,
  MapPin,
  Clock,
  CheckCircle2,
  HelpCircle,
  XCircle,
  Upload
} from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { renderMarkdownPreview } from "@/lib/markdownPreview";
import { toast } from "sonner";

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

type Club = {
  id: number;
  name: string;
  description?: string | null;
  rules?: string | null;
  cover_image_url?: string | null;
  is_private: boolean;
  visibility?: "public" | "private" | "invite";
  owner_id: number;
  created_at: string;
  member_count: number;
  is_member: boolean;
  member_role?: string | null;
};

type ClubInvite = {
  id: number;
  code: string;
  role: string;
  status: string;
  max_uses: number;
  used_count: number;
  expires_at?: string | null;
  created_at: string;
};

export default function ClubDetail() {
  const [match, params] = useRoute("/community/club/:id");
  const clubId = Number(params?.id);
  const [openCommentsId, setOpenCommentsId] = useState<number | null>(null);
  const [commentTextByPost, setCommentTextByPost] = useState<Record<number, string>>({});
  const commentsEndRef = useRef<HTMLDivElement | null>(null);
  const [postText, setPostText] = useState("");
  const [inviteRole, setInviteRole] = useState<"member" | "moderator">("member");
  const [inviteMaxUses, setInviteMaxUses] = useState(1);
  const [inviteExpiryDays, setInviteExpiryDays] = useState<number | "">("");
  
  // Event form state
  const [eventForm, setEventForm] = useState({
    title: "",
    description: "",
    eventType: "training" as "training" | "race" | "social" | "meeting",
    location: "",
    startTime: "",
    endTime: "",
    maxAttendees: "",
  });
  
  // Announcement form state
  const [announcementForm, setAnnouncementForm] = useState({
    title: "",
    content: "",
    isPinned: false,
    expiresAt: "",
  });
  
  // Media upload form state
  const [mediaForm, setMediaForm] = useState({
    mediaUrl: "",
    caption: "",
  });

  const utils = trpc.useUtils();

  const clubQuery = trpc.community.clubs.get.useQuery(
    { clubId },
    { enabled: match && Number.isFinite(clubId) }
  );

  const membersQuery = trpc.community.clubs.members.useQuery(
    { clubId },
    { enabled: !!clubQuery.data }
  );

  const requestsQuery = trpc.community.clubs.requests.useQuery(
    { clubId },
    { enabled: !!clubQuery.data }
  );

  const bannedQuery = trpc.community.clubs.banned.useQuery(
    { clubId },
    { enabled: !!clubQuery.data }
  );

  const feedQuery = trpc.community.clubs.feed.useQuery(
    { clubId, limit: 20 },
    { enabled: !!clubQuery.data }
  );
  
  // Events queries
  const eventsQuery = trpc.community.clubs.events.list.useQuery(
    { clubId },
    { enabled: !!clubQuery.data }
  );
  
  // Announcements queries
  const announcementsQuery = trpc.community.clubs.announcements.list.useQuery(
    { clubId },
    { enabled: !!clubQuery.data }
  );
  
  // Media queries
  const mediaQuery = trpc.community.clubs.media.list.useQuery(
    { clubId },
    { enabled: !!clubQuery.data }
  );

  const club = clubQuery.data as Club | undefined;
  const isStaff = club?.member_role && ["owner", "admin", "moderator"].includes(club.member_role);
  const isOwner = club?.member_role === "owner";

  const invitesQuery = trpc.community.clubs.invites.useQuery(
    { clubId },
    { enabled: !!clubQuery.data && !!isStaff }
  );

  const joinClub = trpc.community.clubs.join.useMutation({
    onSuccess: () => {
      utils.community.clubs.get.invalidate({ clubId });
      utils.community.clubs.list.invalidate();
    },
  });

  const leaveClub = trpc.community.clubs.leave.useMutation({
    onSuccess: () => {
      utils.community.clubs.get.invalidate({ clubId });
      utils.community.clubs.list.invalidate();
    },
  });

  const updateClub = trpc.community.clubs.update.useMutation({
    onSuccess: () => {
      utils.community.clubs.get.invalidate({ clubId });
      utils.community.clubs.list.invalidate();
    },
  });

  const deleteClub = trpc.community.clubs.delete.useMutation({
    onSuccess: () => {
      window.location.href = "/community";
    },
  });

  const approveRequest = trpc.community.clubs.approveRequest.useMutation({
    onSuccess: () => {
      utils.community.clubs.requests.invalidate({ clubId });
      utils.community.clubs.members.invalidate({ clubId });
    },
  });

  const rejectRequest = trpc.community.clubs.rejectRequest.useMutation({
    onSuccess: () => {
      utils.community.clubs.requests.invalidate({ clubId });
    },
  });

  const banMember = trpc.community.clubs.banMember.useMutation({
    onSuccess: () => {
      utils.community.clubs.members.invalidate({ clubId });
      utils.community.clubs.banned.invalidate({ clubId });
    },
  });

  const unbanMember = trpc.community.clubs.unbanMember.useMutation({
    onSuccess: () => {
      utils.community.clubs.banned.invalidate({ clubId });
      utils.community.clubs.members.invalidate({ clubId });
    },
  });

  const updateMemberRole = trpc.community.clubs.updateMemberRole.useMutation({
    onSuccess: () => {
      utils.community.clubs.members.invalidate({ clubId });
    },
  });

  const createInvite = trpc.community.clubs.createInvite.useMutation({
    onSuccess: () => {
      utils.community.clubs.invites.invalidate({ clubId });
    },
  });

  const revokeInvite = trpc.community.clubs.revokeInvite.useMutation({
    onSuccess: () => {
      utils.community.clubs.invites.invalidate({ clubId });
    },
  });

  const [rulesDraft, setRulesDraft] = useState("");
  const [visibilityDraft, setVisibilityDraft] = useState<"public" | "private" | "invite">("public");

  const createPost = trpc.community.clubs.createPost.useMutation({
    onSuccess: () => {
      setPostText("");
      utils.community.clubs.feed.invalidate({ clubId, limit: 20 });
    },
  });
  
  // Event mutations
  const createEvent = trpc.community.clubs.events.create.useMutation({
    onSuccess: () => {
      setEventForm({
        title: "",
        description: "",
        eventType: "training",
        location: "",
        startTime: "",
        endTime: "",
        maxAttendees: "",
      });
      utils.community.clubs.events.list.invalidate({ clubId });
      toast.success("Evento creato con successo!");
    },
    onError: (error) => {
      toast.error(`Errore: ${error.message}`);
    },
  });
  
  const deleteEvent = trpc.community.clubs.events.delete.useMutation({
    onSuccess: () => {
      utils.community.clubs.events.list.invalidate({ clubId });
      toast.success("Evento eliminato");
    },
  });
  
  const rsvpEvent = trpc.community.clubs.events.rsvp.useMutation({
    onSuccess: () => {
      utils.community.clubs.events.list.invalidate({ clubId });
    },
  });
  
  // Announcement mutations
  const createAnnouncement = trpc.community.clubs.announcements.create.useMutation({
    onSuccess: () => {
      setAnnouncementForm({
        title: "",
        content: "",
        isPinned: false,
        expiresAt: "",
      });
      utils.community.clubs.announcements.list.invalidate({ clubId });
      toast.success("Annuncio pubblicato!");
    },
    onError: (error) => {
      toast.error(`Errore: ${error.message}`);
    },
  });
  
  const deleteAnnouncement = trpc.community.clubs.announcements.delete.useMutation({
    onSuccess: () => {
      utils.community.clubs.announcements.list.invalidate({ clubId });
      toast.success("Annuncio eliminato");
    },
  });
  
  // Media mutations
  const uploadMedia = trpc.community.clubs.media.upload.useMutation({
    onSuccess: () => {
      setMediaForm({ mediaUrl: "", caption: "" });
      utils.community.clubs.media.list.invalidate({ clubId });
      toast.success("Media caricato!");
    },
    onError: (error) => {
      toast.error(`Errore: ${error.message}`);
    },
  });
  
  const deleteMedia = trpc.community.clubs.media.delete.useMutation({
    onSuccess: () => {
      utils.community.clubs.media.list.invalidate({ clubId });
      toast.success("Media eliminato");
    },
  });

  const toggleSplash = trpc.community.toggleSplash.useMutation({
    onSuccess: () => utils.community.clubs.feed.invalidate({ clubId, limit: 20 }),
  });

  const addComment = trpc.community.addComment.useMutation({
    onSuccess: (_data, variables) => {
      setCommentTextByPost((prev) => ({ ...prev, [variables.postId]: "" }));
      setOpenCommentsId(variables.postId);
      utils.community.clubs.feed.invalidate({ clubId, limit: 20 });
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

  const copyInviteLink = async (code: string) => {
    const url = `${window.location.origin}/community/invite/${code}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch (_err) {
      // no-op
    }
  };

  useEffect(() => {
    if (club) {
      setRulesDraft(club.rules ?? "");
      setVisibilityDraft((club.visibility as any) ?? (club.is_private ? "private" : "public"));
    }
  }, [club]);
  const feedItems = useMemo(() => (feedQuery.data as FeedItem[]) || [], [feedQuery.data]);
  const members = useMemo(() => (membersQuery.data as any[]) || [], [membersQuery.data]);
  const requests = useMemo(() => (requestsQuery.data as any[]) || [], [requestsQuery.data]);
  const bannedMembers = useMemo(() => (bannedQuery.data as any[]) || [], [bannedQuery.data]);
  const invites = useMemo(() => (invitesQuery.data as ClubInvite[]) || [], [invitesQuery.data]);
  const events = useMemo(() => (eventsQuery.data as any[]) || [], [eventsQuery.data]);
  const announcements = useMemo(() => (announcementsQuery.data as any[]) || [], [announcementsQuery.data]);
  const mediaItems = useMemo(() => (mediaQuery.data as any[]) || [], [mediaQuery.data]);

  if (!match || !Number.isFinite(clubId)) {
    return null;
  }

  return (
    <AppLayout className="text-foreground">
      <div className="min-h-screen pb-24">
        <section className="relative overflow-hidden bg-gradient-to-b from-background/80 to-background py-12">
          <div className="pointer-events-none absolute right-0 top-0 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
          <div className="container relative z-10 space-y-6">
            <Link href="/community" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" />
              Torna ai club
            </Link>

            <div className="flex flex-col lg:flex-row gap-6 items-start">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <Users className="h-6 w-6 text-primary" />
                  <span className="text-sm text-muted-foreground">Club</span>
                </div>
                <h1 className="text-3xl md:text-4xl font-bold neon-gradient-text">{club?.name ?? "Club"}</h1>
                <p className="text-muted-foreground mt-2 max-w-2xl">
                  {club?.description || "Condividi progressi, allenamenti e obiettivi con la tua squadra."}
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                  <span>{club?.member_count ?? 0} membri</span>
                  <span>{club?.is_private ? "Privato" : "Pubblico"}</span>
                </div>
              </div>
              {club && (
                <div className="flex items-center gap-2">
                  {club.is_member ? (
                    <Button variant="outline-neon" onClick={() => leaveClub.mutate({ clubId })}>
                      Lascia Club
                    </Button>
                  ) : (
                    <Button
                      variant="neon"
                      onClick={() => joinClub.mutate({ clubId })}
                      disabled={club.visibility !== "public"}
                    >
                      {club.visibility === "invite" ? "Su invito" : "Entra nel Club"}
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="py-10">
          <div className="container space-y-8">
            {club && club.is_private && !club.is_member ? (
              <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
                <CardContent className="p-6 text-muted-foreground">
                  Questo club è privato. Entra nel club per vedere i contenuti.
                </CardContent>
              </Card>
            ) : (
              <>
                {club?.rules && (
                  <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
                    <CardContent className="p-6">
                      <h3 className="text-lg font-semibold mb-3">Regole del club</h3>
                      <div
                        className="prose dark:prose-invert prose-sm max-w-none"
                        dangerouslySetInnerHTML={{ __html: renderMarkdownPreview(club.rules) }}
                      />
                    </CardContent>
                  </Card>
                )}

                {/* Tab Navigation */}
                <Tabs defaultValue="feed" className="space-y-6">
                  <TabsList className="grid w-full grid-cols-3 lg:grid-cols-6">
                    <TabsTrigger value="feed" className="flex items-center gap-2">
                      <Droplet className="h-4 w-4" />
                      <span className="hidden sm:inline">Feed</span>
                    </TabsTrigger>
                    <TabsTrigger value="eventi" className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      <span className="hidden sm:inline">Eventi</span>
                    </TabsTrigger>
                    <TabsTrigger value="membri" className="flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      <span className="hidden sm:inline">Membri</span>
                    </TabsTrigger>
                    <TabsTrigger value="gallery" className="flex items-center gap-2">
                      <ImageIcon className="h-4 w-4" />
                      <span className="hidden sm:inline">Gallery</span>
                    </TabsTrigger>
                    <TabsTrigger value="annunci" className="flex items-center gap-2">
                      <Megaphone className="h-4 w-4" />
                      <span className="hidden sm:inline">Annunci</span>
                    </TabsTrigger>
                    <TabsTrigger value="stats" className="flex items-center gap-2">
                      <BarChart3 className="h-4 w-4" />
                      <span className="hidden sm:inline">Stats</span>
                    </TabsTrigger>
                  </TabsList>

                  {/* Feed Tab Content */}
                  <TabsContent value="feed" className="space-y-6">
                    <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
                      <CardContent className="p-6 space-y-4">
                        <div className="flex items-center justify-between">
                          <h2 className="text-xl font-semibold">Bacheca del club</h2>
                          <span className="text-sm text-muted-foreground">{feedItems.length} post</span>
                        </div>
                        <div className="flex flex-col md:flex-row gap-3">
                          <Input
                            placeholder="Condividi un pensiero con il club..."
                            value={postText}
                            onChange={(e) => setPostText(e.target.value)}
                            className="bg-background/60"
                          />
                          <Button
                            variant="neon"
                            onClick={() =>
                              createPost.mutate({
                                clubId,
                                content: postText.trim(),
                              })
                            }
                            disabled={createPost.isPending || postText.trim().length < 2}
                          >
                            <Plus className="h-4 w-4 mr-2" />
                            Pubblica
                          </Button>
                        </div>
                      </CardContent>
                    </Card>

                    {feedQuery.isLoading ? (
                      <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
                        <CardContent className="p-6 text-muted-foreground">Caricamento feed...</CardContent>
                      </Card>
                    ) : feedItems.length === 0 ? (
                      <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
                        <CardContent className="p-6 text-muted-foreground">
                          Nessun contenuto nel club. Condividi il primo post!
                        </CardContent>
                      </Card>
                    ) : (
                      <div className="space-y-6">
                        {feedItems.map((post) => {
                          const distance = formatDistance(post.activity_distance_meters);
                          const duration = formatTime(post.activity_duration_seconds);
                          const pace = formatPace(post.activity_distance_meters, post.activity_duration_seconds);
                          const isPostOwner = post.user_id === club?.owner_id;
                          return (
                            <motion.div
                              key={post.id}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ duration: 0.4 }}
                            >
                              <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
                                <CardContent className="p-4 sm:p-6">
                                  <div className="flex flex-col sm:flex-row items-start gap-3 mb-4">
                                    {post.user_avatar ? (
                                      <img
                                        src={post.user_avatar}
                                        alt={post.user_name || post.user_email}
                                        className="h-12 w-12 rounded-full object-cover"
                                      />
                                    ) : (
                                      <div className="h-12 w-12 rounded-full bg-muted/40 dark:bg-white/10" />
                                    )}
                                    <div className="flex-1">
                                      <div className="font-semibold">{post.user_name || post.user_email}</div>
                                      <div className="text-xs text-muted-foreground">{formatDate(post.activity_date)}</div>
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
                                    <div className="mb-6 grid grid-cols-2 gap-3 rounded-lg border border-border bg-primary/5 p-4 md:grid-cols-4">
                                      {distance && (
                                        <div className="text-center">
                                          <div className="text-2xl font-bold text-primary">{distance}</div>
                                          <div className="text-xs text-muted-foreground">Distanza</div>
                                        </div>
                                      )}
                                      {duration && (
                                        <div className="text-center">
                                          <div className="text-2xl font-bold text-primary">{duration}</div>
                                          <div className="text-xs text-muted-foreground">Tempo</div>
                                        </div>
                                      )}
                                      {pace && (
                                        <div className="text-center">
                                          <div className="text-2xl font-bold text-accent">{pace}</div>
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

                                  <div className="flex flex-col sm:flex-row gap-3 mb-4">
                                    <motion.button
                                      whileHover={{ scale: 1.05 }}
                                      whileTap={{ scale: 0.95 }}
                                      onClick={() => toggleSplash.mutate({ postId: post.id })}
                                      disabled={toggleSplash.isPending || isPostOwner}
                                      className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg font-semibold transition-all ${
                                        post.has_splashed
                                          ? "bg-primary/20 text-primary border border-primary/50"
                                          : "bg-transparent text-muted-foreground border border-border/50 hover:border-primary/50 hover:text-primary"
                                      }`}
                                    >
                                      <Droplet className="h-5 w-5" />
                                      <span>Splash {post.splash_count > 0 ? `(${post.splash_count})` : ""}</span>
                                    </motion.button>

                                    <Dialog
                                      open={openCommentsId === post.id}
                                      onOpenChange={(open) => setOpenCommentsId(open ? post.id : null)}
                                    >
                                      <DialogTrigger asChild>
                                        <Button
                                          variant="outline-neon"
                                          className="flex-1 flex items-center justify-center gap-2"
                                        >
                                          <MessageCircle className="h-5 w-5" />
                                          <span>Commenti</span>
                                          {post.comment_count > 0 && (
                                            <span className="ml-1 inline-flex min-w-[22px] h-5 items-center justify-center rounded-full bg-primary/20 px-2 text-xs font-semibold text-primary">
                                              {post.comment_count}
                                            </span>
                                          )}
                                        </Button>
                                      </DialogTrigger>
                                      <DialogContent className="max-w-lg bg-card text-foreground border border-border">
                                        <DialogHeader>
                                          <DialogTitle>Commenti</DialogTitle>
                                        </DialogHeader>
                                        <div className="space-y-3">
                                          <div className="space-y-2 text-sm text-muted-foreground max-h-64 overflow-y-auto pr-1">
                                            {commentsQuery.isLoading ? (
                                              <div className="text-muted-foreground">Caricamento commenti...</div>
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
                                                    <div className="h-6 w-6 rounded-full bg-muted/40 dark:bg-white/10" />
                                                  )}
                                                  <div>
                                                    <div className="text-xs text-muted-foreground">
                                                      {comment.user_name || comment.user_email}
                                                    </div>
                                                    <div>{comment.content}</div>
                                                  </div>
                                                </div>
                                              ))
                                            ) : (
                                              <div className="text-muted-foreground">Nessun commento ancora.</div>
                                            )}
                                          </div>

                                          <div className="flex flex-col sm:flex-row gap-2">
                                            <Input
                                              value={commentTextByPost[post.id] ?? ""}
                                              onChange={(e) =>
                                                setCommentTextByPost((prev) => ({ ...prev, [post.id]: e.target.value }))
                                              }
                                              onKeyDown={(event) => {
                                                if (event.key === "Enter" && !event.shiftKey) {
                                                  event.preventDefault();
                                                  const content = (commentTextByPost[post.id] ?? "").trim();
                                                  if (!content || addComment.isPending) return;
                                                  addComment.mutate({ postId: post.id, content });
                                                }
                                              }}
                                              placeholder="Scrivi un commento..."
                                            />
                                            <Button
                                              variant="neon"
                                              onClick={() =>
                                                addComment.mutate({
                                                  postId: post.id,
                                                  content: (commentTextByPost[post.id] ?? "").trim(),
                                                })
                                              }
                                              disabled={
                                                addComment.isPending ||
                                                (commentTextByPost[post.id] ?? "").trim().length === 0
                                              }
                                            >
                                              Pubblica
                                            </Button>
                                          </div>
                                          <div ref={commentsEndRef} />
                                        </div>
                                      </DialogContent>
                                    </Dialog>

                                    <Button variant="outline-neon" className="flex-1 flex items-center justify-center gap-2">
                                      <Share2 className="h-5 w-5" />
                                      <span>Condividi</span>
                                    </Button>
                                  </div>
                                </CardContent>
                              </Card>
                            </motion.div>
                          );
                        })}
                      </div>
                    )}
                  </TabsContent>

                  {/* Eventi Tab Content */}
                  <TabsContent value="eventi" className="space-y-6">
                    {isStaff && (
                      <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
                        <CardContent className="p-6 space-y-4">
                          <h3 className="text-lg font-semibold">Crea Evento</h3>
                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="space-y-2">
                              <label className="text-xs text-muted-foreground">Titolo</label>
                              <Input
                                value={eventForm.title}
                                onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })}
                                placeholder="Titolo evento"
                                className="bg-background/60"
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="text-xs text-muted-foreground">Tipo</label>
                              <select
                                value={eventForm.eventType}
                                onChange={(e) => setEventForm({ ...eventForm, eventType: e.target.value as any })}
                                className="w-full rounded-md bg-background/60 border border-border/60 px-3 py-2 text-sm"
                              >
                                <option value="training">Allenamento</option>
                                <option value="race">Gara</option>
                                <option value="social">Social</option>
                                <option value="meeting">Riunione</option>
                              </select>
                            </div>
                            <div className="space-y-2 md:col-span-2">
                              <label className="text-xs text-muted-foreground">Descrizione</label>
                              <textarea
                                value={eventForm.description}
                                onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })}
                                placeholder="Descrizione evento"
                                className="min-h-[80px] w-full rounded-md bg-background/60 border border-border/60 px-3 py-2 text-sm"
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="text-xs text-muted-foreground">Luogo</label>
                              <Input
                                value={eventForm.location}
                                onChange={(e) => setEventForm({ ...eventForm, location: e.target.value })}
                                placeholder="Luogo"
                                className="bg-background/60"
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="text-xs text-muted-foreground">Partecipanti max</label>
                              <Input
                                type="number"
                                value={eventForm.maxAttendees}
                                onChange={(e) => setEventForm({ ...eventForm, maxAttendees: e.target.value })}
                                placeholder="Illimitati"
                                className="bg-background/60"
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="text-xs text-muted-foreground">Inizio</label>
                              <Input
                                type="datetime-local"
                                value={eventForm.startTime}
                                onChange={(e) => setEventForm({ ...eventForm, startTime: e.target.value })}
                                className="bg-background/60"
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="text-xs text-muted-foreground">Fine</label>
                              <Input
                                type="datetime-local"
                                value={eventForm.endTime}
                                onChange={(e) => setEventForm({ ...eventForm, endTime: e.target.value })}
                                className="bg-background/60"
                              />
                            </div>
                          </div>
                          <Button
                            variant="neon"
                            onClick={() => createEvent.mutate({
                              clubId,
                              title: eventForm.title,
                              description: eventForm.description || null,
                              eventType: eventForm.eventType,
                              location: eventForm.location || null,
                              startTime: new Date(eventForm.startTime),
                              endTime: eventForm.endTime ? new Date(eventForm.endTime) : null,
                              maxAttendees: eventForm.maxAttendees ? Number(eventForm.maxAttendees) : null,
                            })}
                            disabled={!eventForm.title || !eventForm.startTime}
                          >
                            <Plus className="h-4 w-4 mr-2" />
                            Crea Evento
                          </Button>
                        </CardContent>
                      </Card>
                    )}

                    {eventsQuery.isLoading ? (
                      <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
                        <CardContent className="p-6 text-muted-foreground">Caricamento eventi...</CardContent>
                      </Card>
                    ) : events.length === 0 ? (
                      <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
                        <CardContent className="p-6 text-muted-foreground">
                          Nessun evento programmato. {isStaff && "Crea il primo evento!"}
                        </CardContent>
                      </Card>
                    ) : (
                      <div className="space-y-4">
                        {events.map((event: any) => (
                          <motion.div
                            key={event.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.3 }}
                          >
                            <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
                              <CardContent className="p-6">
                                <div className="flex items-start justify-between mb-3">
                                  <div className="flex-1">
                                    <h3 className="text-lg font-semibold">{event.title}</h3>
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                                      <Calendar className="h-4 w-4" />
                                      <span>{formatDate(event.start_time)}</span>
                                    </div>
                                  </div>
                                  {isStaff && (
                                    <Button
                                      size="sm"
                                      variant="destructive"
                                      onClick={() => deleteEvent.mutate({ clubId, eventId: event.id })}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  )}
                                </div>
                                {event.description && (
                                  <p className="text-sm text-muted-foreground mb-3">{event.description}</p>
                                )}
                                <div className="flex flex-wrap gap-3 text-sm text-muted-foreground mb-4">
                                  {event.location && (
                                    <div className="flex items-center gap-1">
                                      <MapPin className="h-4 w-4" />
                                      <span>{event.location}</span>
                                    </div>
                                  )}
                                  {event.end_time && (
                                    <div className="flex items-center gap-1">
                                      <Clock className="h-4 w-4" />
                                      <span>Fine: {formatDate(event.end_time)}</span>
                                    </div>
                                  )}
                                </div>
                                <div className="flex items-center gap-3">
                                  <Button
                                    size="sm"
                                    variant={event.user_rsvp === "going" ? "neon" : "outline-neon"}
                                    onClick={() => rsvpEvent.mutate({ clubId, eventId: event.id, response: "going" })}
                                  >
                                    <CheckCircle2 className="h-4 w-4 mr-1" />
                                    Partecipo ({event.going_count || 0})
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant={event.user_rsvp === "maybe" ? "neon" : "outline-neon"}
                                    onClick={() => rsvpEvent.mutate({ clubId, eventId: event.id, response: "maybe" })}
                                  >
                                    <HelpCircle className="h-4 w-4 mr-1" />
                                    Forse ({event.maybe_count || 0})
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant={event.user_rsvp === "not_going" ? "destructive" : "outline-neon"}
                                    onClick={() => rsvpEvent.mutate({ clubId, eventId: event.id, response: "not_going" })}
                                  >
                                    <XCircle className="h-4 w-4 mr-1" />
                                    Non partecipo
                                  </Button>
                                </div>
                              </CardContent>
                            </Card>
                          </motion.div>
                        ))}
                      </div>
                    )}
                  </TabsContent>

                  {/* Membri Tab Content */}
                  <TabsContent value="membri" className="space-y-6">
                    <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
                      <CardContent className="p-6 space-y-4">
                        <div className="flex items-center justify-between">
                          <h3 className="text-lg font-semibold">Membri</h3>
                          <span className="text-sm text-muted-foreground">{members.length} membri</span>
                        </div>
                        {members.length === 0 ? (
                          <div className="text-muted-foreground text-sm">Nessun membro disponibile.</div>
                        ) : (
                          <div className="space-y-3">
                            {members.map((member: any) => (
                              <div key={member.user_id} className="flex items-center gap-3">
                                {member.user_avatar ? (
                                  <img
                                    src={member.user_avatar}
                                    alt={member.user_name || member.user_email}
                                    className="h-9 w-9 rounded-full object-cover"
                                  />
                                ) : (
                                  <div className="h-9 w-9 rounded-full bg-muted/40 dark:bg-white/10" />
                                )}
                                <div className="flex-1">
                                  <div className="text-sm font-semibold">
                                    {member.user_name || member.user_email}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {member.role === "moderator" ? "Moderatore" : member.role === "admin" ? "Admin" : member.role}
                                  </div>
                                </div>
                                {isOwner && member.role !== "owner" && (
                                  <select
                                    value={member.role}
                                    onChange={(e) =>
                                      updateMemberRole.mutate({
                                        clubId,
                                        userId: member.user_id,
                                        role: e.target.value as "member" | "moderator" | "admin",
                                      })
                                    }
                                    className="rounded-md bg-muted/40 dark:bg-white/5 border border-border/60 px-2 py-1 text-xs"
                                  >
                                    <option value="member">Membro</option>
                                    <option value="moderator">Moderatore</option>
                                    <option value="admin">Admin</option>
                                  </select>
                                )}
                                {isStaff && member.role !== "owner" && (
                                  <Button
                                    size="sm"
                                    variant="outline-neon"
                                    onClick={() => banMember.mutate({ clubId, userId: member.user_id })}
                                  >
                                    Ban
                                  </Button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {isStaff && (
                      <div className="grid gap-6 lg:grid-cols-2">
                        <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
                          <CardContent className="p-6 space-y-4">
                            <h3 className="text-lg font-semibold">Richieste di ingresso</h3>
                            {requests.length === 0 ? (
                              <div className="text-muted-foreground text-sm">Nessuna richiesta in attesa.</div>
                            ) : (
                              <div className="space-y-3">
                                {requests.map((member: any) => (
                                  <div key={member.user_id} className="flex items-center gap-3">
                                    {member.user_avatar ? (
                                      <img
                                        src={member.user_avatar}
                                        alt={member.user_name || member.user_email}
                                        className="h-8 w-8 rounded-full object-cover"
                                      />
                                    ) : (
                                      <div className="h-8 w-8 rounded-full bg-muted/40 dark:bg-white/10" />
                                    )}
                                    <div className="flex-1">
                                      <div className="text-sm font-semibold">
                                        {member.user_name || member.user_email}
                                      </div>
                                      <div className="text-xs text-muted-foreground">Richiesta in attesa</div>
                                    </div>
                                    <Button
                                      size="sm"
                                      variant="neon"
                                      onClick={() => approveRequest.mutate({ clubId, userId: member.user_id })}
                                    >
                                      Approva
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline-neon"
                                      onClick={() => rejectRequest.mutate({ clubId, userId: member.user_id })}
                                    >
                                      Rifiuta
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </CardContent>
                        </Card>

                        <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
                          <CardContent className="p-6 space-y-4">
                            <h3 className="text-lg font-semibold">Utenti bannati</h3>
                            {bannedMembers.length === 0 ? (
                              <div className="text-muted-foreground text-sm">Nessun utente bannato.</div>
                            ) : (
                              <div className="space-y-3">
                                {bannedMembers.map((member: any) => (
                                  <div key={member.user_id} className="flex items-center gap-3">
                                    {member.user_avatar ? (
                                      <img
                                        src={member.user_avatar}
                                        alt={member.user_name || member.user_email}
                                        className="h-8 w-8 rounded-full object-cover"
                                      />
                                    ) : (
                                      <div className="h-8 w-8 rounded-full bg-muted/40 dark:bg-white/10" />
                                    )}
                                    <div className="flex-1">
                                      <div className="text-sm font-semibold">
                                        {member.user_name || member.user_email}
                                      </div>
                                      <div className="text-xs text-muted-foreground">Bannato</div>
                                    </div>
                                    <Button
                                      size="sm"
                                      variant="outline-neon"
                                      onClick={() => unbanMember.mutate({ clubId, userId: member.user_id })}
                                    >
                                      Riammetti
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      </div>
                    )}
                  </TabsContent>

                  {/* Gallery Tab Content */}
                  <TabsContent value="gallery" className="space-y-6">
                    {isStaff && (
                      <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
                        <CardContent className="p-6 space-y-4">
                          <h3 className="text-lg font-semibold">Carica Media</h3>
                          <div className="space-y-3">
                            <div className="space-y-2">
                              <label className="text-xs text-muted-foreground">URL Media</label>
                              <Input
                                value={mediaForm.mediaUrl}
                                onChange={(e) => setMediaForm({ ...mediaForm, mediaUrl: e.target.value })}
                                placeholder="https://..."
                                className="bg-background/60"
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="text-xs text-muted-foreground">Didascalia (opzionale)</label>
                              <Input
                                value={mediaForm.caption}
                                onChange={(e) => setMediaForm({ ...mediaForm, caption: e.target.value })}
                                placeholder="Descrizione..."
                                className="bg-background/60"
                              />
                            </div>
                          </div>
                          <Button
                            variant="neon"
                            onClick={() => uploadMedia.mutate({
                              clubId,
                              mediaUrl: mediaForm.mediaUrl,
                              caption: mediaForm.caption || null,
                            })}
                            disabled={!mediaForm.mediaUrl}
                          >
                            <Upload className="h-4 w-4 mr-2" />
                            Carica
                          </Button>
                        </CardContent>
                      </Card>
                    )}

                    {mediaQuery.isLoading ? (
                      <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
                        <CardContent className="p-6 text-muted-foreground">Caricamento gallery...</CardContent>
                      </Card>
                    ) : mediaItems.length === 0 ? (
                      <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
                        <CardContent className="p-6 text-muted-foreground">
                          Nessun media disponibile. {isStaff && "Carica la prima immagine!"}
                        </CardContent>
                      </Card>
                    ) : (
                      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {mediaItems.map((media: any) => (
                          <motion.div
                            key={media.id}
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 0.3 }}
                          >
                            <Card className="border-border/50 bg-card/60 backdrop-blur-sm overflow-hidden">
                              <img
                                src={media.media_url}
                                alt={media.caption || "Gallery"}
                                className="w-full h-48 object-cover"
                              />
                              <CardContent className="p-4">
                                {media.caption && (
                                  <p className="text-sm text-muted-foreground mb-2">{media.caption}</p>
                                )}
                                <div className="flex items-center justify-between">
                                  <span className="text-xs text-muted-foreground">
                                    {formatDate(media.created_at)}
                                  </span>
                                  {isStaff && (
                                    <Button
                                      size="sm"
                                      variant="destructive"
                                      onClick={() => deleteMedia.mutate({ clubId, mediaId: media.id })}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  )}
                                </div>
                              </CardContent>
                            </Card>
                          </motion.div>
                        ))}
                      </div>
                    )}
                  </TabsContent>

                  {/* Annunci Tab Content */}
                  <TabsContent value="annunci" className="space-y-6">
                    {isStaff && (
                      <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
                        <CardContent className="p-6 space-y-4">
                          <h3 className="text-lg font-semibold">Crea Annuncio</h3>
                          <div className="space-y-3">
                            <div className="space-y-2">
                              <label className="text-xs text-muted-foreground">Titolo</label>
                              <Input
                                value={announcementForm.title}
                                onChange={(e) => setAnnouncementForm({ ...announcementForm, title: e.target.value })}
                                placeholder="Titolo annuncio"
                                className="bg-background/60"
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="text-xs text-muted-foreground">Contenuto</label>
                              <textarea
                                value={announcementForm.content}
                                onChange={(e) => setAnnouncementForm({ ...announcementForm, content: e.target.value })}
                                placeholder="Messaggio..."
                                className="min-h-[100px] w-full rounded-md bg-background/60 border border-border/60 px-3 py-2 text-sm"
                              />
                            </div>
                            <div className="flex items-center gap-3">
                              <label className="flex items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  checked={announcementForm.isPinned}
                                  onChange={(e) => setAnnouncementForm({ ...announcementForm, isPinned: e.target.checked })}
                                  className="rounded"
                                />
                                <Pin className="h-4 w-4" />
                                Fissa in alto
                              </label>
                              <div className="space-y-2 flex-1">
                                <Input
                                  type="date"
                                  value={announcementForm.expiresAt}
                                  onChange={(e) => setAnnouncementForm({ ...announcementForm, expiresAt: e.target.value })}
                                  placeholder="Scadenza (opzionale)"
                                  className="bg-background/60"
                                />
                              </div>
                            </div>
                          </div>
                          <Button
                            variant="neon"
                            onClick={() => createAnnouncement.mutate({
                              clubId,
                              title: announcementForm.title,
                              content: announcementForm.content,
                              isPinned: announcementForm.isPinned,
                              expiresAt: announcementForm.expiresAt ? new Date(announcementForm.expiresAt) : null,
                            })}
                            disabled={!announcementForm.title || !announcementForm.content}
                          >
                            <Megaphone className="h-4 w-4 mr-2" />
                            Pubblica Annuncio
                          </Button>
                        </CardContent>
                      </Card>
                    )}

                    {announcementsQuery.isLoading ? (
                      <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
                        <CardContent className="p-6 text-muted-foreground">Caricamento annunci...</CardContent>
                      </Card>
                    ) : announcements.length === 0 ? (
                      <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
                        <CardContent className="p-6 text-muted-foreground">
                          Nessun annuncio disponibile. {isStaff && "Crea il primo annuncio!"}
                        </CardContent>
                      </Card>
                    ) : (
                      <div className="space-y-4">
                        {announcements.map((announcement: any) => (
                          <motion.div
                            key={announcement.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.3 }}
                          >
                            <Card className={`border-border/50 bg-card/60 backdrop-blur-sm ${announcement.is_pinned ? 'border-primary/50' : ''}`}>
                              <CardContent className="p-6">
                                <div className="flex items-start justify-between mb-2">
                                  <div className="flex items-center gap-2">
                                    <h3 className="text-lg font-semibold">{announcement.title}</h3>
                                    {announcement.is_pinned && <Pin className="h-4 w-4 text-primary" />}
                                  </div>
                                  {isStaff && (
                                    <Button
                                      size="sm"
                                      variant="destructive"
                                      onClick={() => deleteAnnouncement.mutate({ clubId, announcementId: announcement.id })}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  )}
                                </div>
                                <p className="text-muted-foreground mb-3">{announcement.content}</p>
                                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                  <span>{formatDate(announcement.created_at)}</span>
                                  {announcement.expires_at && (
                                    <span>Scade: {formatDate(announcement.expires_at)}</span>
                                  )}
                                </div>
                              </CardContent>
                            </Card>
                          </motion.div>
                        ))}
                      </div>
                    )}
                  </TabsContent>

                  {/* Stats Tab Content */}
                  <TabsContent value="stats" className="space-y-6">
                    <div className="grid gap-6 md:grid-cols-2">
                      <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
                        <CardContent className="p-6">
                          <div className="flex items-center gap-3 mb-4">
                            <div className="h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center">
                              <Users className="h-6 w-6 text-primary" />
                            </div>
                            <div>
                              <div className="text-2xl font-bold">{club?.member_count || 0}</div>
                              <div className="text-sm text-muted-foreground">Membri totali</div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
                        <CardContent className="p-6">
                          <div className="flex items-center gap-3 mb-4">
                            <div className="h-12 w-12 rounded-full bg-accent/20 flex items-center justify-center">
                              <Droplet className="h-6 w-6 text-accent" />
                            </div>
                            <div>
                              <div className="text-2xl font-bold">{feedItems.length}</div>
                              <div className="text-sm text-muted-foreground">Post pubblicati</div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
                        <CardContent className="p-6">
                          <div className="flex items-center gap-3 mb-4">
                            <div className="h-12 w-12 rounded-full bg-purple-500/20 flex items-center justify-center">
                              <Calendar className="h-6 w-6 text-purple-400" />
                            </div>
                            <div>
                              <div className="text-2xl font-bold">{events.length}</div>
                              <div className="text-sm text-muted-foreground">Eventi programmati</div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
                        <CardContent className="p-6">
                          <div className="flex items-center gap-3 mb-4">
                            <div className="h-12 w-12 rounded-full bg-green-500/20 flex items-center justify-center">
                              <ImageIcon className="h-6 w-6 text-green-400" />
                            </div>
                            <div>
                              <div className="text-2xl font-bold">{mediaItems.length}</div>
                              <div className="text-sm text-muted-foreground">Media caricati</div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
                      <CardContent className="p-6 space-y-3">
                        <h3 className="text-lg font-semibold">Informazioni Club</h3>
                        <div className="grid gap-3 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Creato il:</span>
                            <span className="font-semibold">{formatDate(club?.created_at)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Visibilità:</span>
                            <span className="font-semibold">
                              {club?.visibility === "public" ? "Pubblico" : club?.visibility === "private" ? "Privato" : "Su invito"}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Il tuo ruolo:</span>
                            <span className="font-semibold capitalize">{club?.member_role || "Nessuno"}</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>
                </Tabs>

                {/* Club Settings - Below Tabs (Only for Staff) */}
                {isStaff && (
                  <>
                    <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
                      <CardContent className="p-6 space-y-4">
                        <div className="flex items-center justify-between">
                          <h3 className="text-lg font-semibold">Impostazioni club</h3>
                          <span className="text-xs text-muted-foreground">
                            {isOwner ? "Owner" : "Moderazione"}
                          </span>
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="space-y-2">
                            <label className="text-xs text-muted-foreground">Visibilità</label>
                            <select
                              value={visibilityDraft}
                              onChange={(e) => setVisibilityDraft(e.target.value as "public" | "private" | "invite")}
                              disabled={!isOwner}
                              className="w-full rounded-md bg-background/60 border border-border/60 px-3 py-2 text-sm"
                            >
                              <option value="public">Pubblico</option>
                              <option value="private">Privato</option>
                              <option value="invite">Solo su invito</option>
                            </select>
                          </div>
                          <div className="space-y-2">
                            <label className="text-xs text-muted-foreground">Regole del club</label>
                            <textarea
                              value={rulesDraft}
                              onChange={(e) => setRulesDraft(e.target.value)}
                              className="min-h-[90px] w-full rounded-md bg-background/60 border border-border/60 px-3 py-2 text-sm"
                            />
                          </div>
                        </div>
                        {rulesDraft.trim().length > 0 && (
                          <div className="rounded-lg border border-border/60 bg-background/60 p-3">
                            <div className="text-xs text-muted-foreground mb-2">Anteprima regole</div>
                            <div
                              className="prose dark:prose-invert prose-sm max-w-none"
                              dangerouslySetInnerHTML={{ __html: renderMarkdownPreview(rulesDraft) }}
                            />
                          </div>
                        )}
                        <div className="flex flex-col sm:flex-row gap-2">
                          <Button
                            variant="neon"
                            onClick={() =>
                              updateClub.mutate({
                                clubId,
                                rules: rulesDraft.trim() || null,
                                visibility: visibilityDraft,
                              })
                            }
                          >
                            Salva impostazioni
                          </Button>
                          {isOwner && (
                            <Button
                              variant="destructive"
                              onClick={() => {
                                if (confirm("Vuoi eliminare definitivamente questo club?")) {
                                  deleteClub.mutate({ clubId });
                                }
                              }}
                            >
                              Elimina club
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
                      <CardContent className="p-6 space-y-4">
                        <h3 className="text-lg font-semibold">Inviti</h3>
                        <div className="grid gap-3 md:grid-cols-3">
                          <div className="space-y-2">
                            <label className="text-xs text-muted-foreground">Ruolo</label>
                            <select
                              value={inviteRole}
                              onChange={(e) => setInviteRole(e.target.value as "member" | "moderator")}
                              className="w-full rounded-md bg-background/60 border border-border/60 px-3 py-2 text-sm"
                            >
                              <option value="member">Membro</option>
                              {(isOwner || club?.member_role === "admin") && (
                                <option value="moderator">Moderatore</option>
                              )}
                            </select>
                          </div>
                          <div className="space-y-2">
                            <label className="text-xs text-muted-foreground">Utilizzi max</label>
                            <Input
                              type="number"
                              min={1}
                              max={100}
                              value={inviteMaxUses}
                              onChange={(e) => setInviteMaxUses(Number(e.target.value) || 1)}
                              className="bg-background/60 border-border/60"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-xs text-muted-foreground">Scadenza (giorni)</label>
                            <Input
                              type="number"
                              min={1}
                              placeholder="Nessuna"
                              value={inviteExpiryDays}
                              onChange={(e) => {
                                const value = e.target.value;
                                setInviteExpiryDays(value ? Number(value) : "");
                              }}
                              className="bg-background/60 border-border/60"
                            />
                          </div>
                        </div>
                        <Button
                          variant="neon"
                          disabled={createInvite.isPending}
                          onClick={() => {
                            const days = typeof inviteExpiryDays === "number" ? inviteExpiryDays : 0;
                            const expiresAt = days ? new Date(Date.now() + days * 24 * 60 * 60 * 1000) : null;
                            createInvite.mutate({
                              clubId,
                              role: inviteRole,
                              maxUses: inviteMaxUses,
                              expiresAt,
                            });
                          }}
                        >
                          Crea invito
                        </Button>

                        {invites.length === 0 ? (
                          <div className="text-sm text-muted-foreground">Nessun invito attivo.</div>
                        ) : (
                          <div className="space-y-3">
                            {invites.map((invite) => {
                              const isExpired =
                                invite.expires_at && new Date(invite.expires_at).getTime() < Date.now();
                              const isUsedUp = invite.used_count >= invite.max_uses;
                              const statusLabel = isExpired
                                ? "Scaduto"
                                : isUsedUp
                                ? "Esaurito"
                                : invite.status === "revoked"
                                ? "Revocato"
                                : "Attivo";
                              return (
                                <div
                                  key={invite.id}
                                  className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 rounded-lg border border-border/60 bg-background/60 px-3 py-2"
                                >
                                  <div className="text-sm">
                                    <div className="font-semibold">{invite.code}</div>
                                    <div className="text-xs text-muted-foreground">
                                      Ruolo: {invite.role} · Usati {invite.used_count}/{invite.max_uses} · {statusLabel}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Button
                                      size="sm"
                                      variant="outline-neon"
                                      onClick={() => copyInviteLink(invite.code)}
                                    >
                                      Copia link
                                    </Button>
                                    {invite.status === "active" && !isExpired && !isUsedUp && (
                                      <Button
                                        size="sm"
                                        variant="destructive"
                                        onClick={() => revokeInvite.mutate({ clubId, inviteId: invite.id })}
                                      >
                                        Revoca
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </>
                )}
              </>
            )}
          </div>
        </section>

      </div>
    </AppLayout>
  );
}
