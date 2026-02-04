import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useRoute } from "wouter";
import { motion } from "framer-motion";
import { Users, ArrowLeft, Droplet, MessageCircle, Share2, Plus } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { renderMarkdownPreview } from "@/lib/markdownPreview";

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

  if (!match || !Number.isFinite(clubId)) {
    return null;
  }

  return (
    <AppLayout showBubbles={true} bubbleIntensity="medium" className="text-foreground">
      <div className="min-h-screen pb-24">
        <section className="relative py-12 bg-gradient-to-b from-[var(--navy)] to-background overflow-hidden">
          <div className="absolute top-0 right-0 w-72 h-72 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="container relative z-10 space-y-6">
            <Link href="/community" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" />
              Torna ai club
            </Link>

            <div className="flex flex-col lg:flex-row gap-6 items-start">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <Users className="h-6 w-6 text-[var(--azure)]" />
                  <span className="text-sm text-muted-foreground">Club</span>
                </div>
                <h1 className="text-3xl md:text-4xl font-bold">{club?.name ?? "Club"}</h1>
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
                    <Button variant="outline" onClick={() => leaveClub.mutate({ clubId })}>
                      Lascia Club
                    </Button>
                  ) : (
                    <Button
                      className="bg-[var(--azure)] text-primary-foreground"
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
                <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
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
                          className="bg-muted/40 dark:bg-white/5 border-border/60"
                        />
                        <Button
                          className="bg-[var(--gold)] text-slate-900 dark:text-[var(--navy)]"
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

                  <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
                    <CardContent className="p-6 space-y-4">
                      <h3 className="text-lg font-semibold">Membri attivi</h3>
                      <div className="space-y-3 max-h-64 overflow-auto pr-2">
                        {members.length === 0 ? (
                          <div className="text-muted-foreground text-sm">Nessun membro disponibile.</div>
                        ) : (
                          members.map((member) => (
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
                                  variant="outline"
                                  onClick={() => banMember.mutate({ clubId, userId: member.user_id })}
                                >
                                  Ban
                                </Button>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {isStaff && (
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
                            className="w-full rounded-md bg-muted/40 dark:bg-white/5 border border-border/60 px-3 py-2 text-sm"
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
                            className="min-h-[90px] w-full rounded-md bg-muted/40 dark:bg-white/5 border border-border/60 px-3 py-2 text-sm"
                          />
                        </div>
                      </div>
                      {rulesDraft.trim().length > 0 && (
                        <div className="rounded-lg border border-border/60 bg-muted/40 dark:bg-white/5 p-3">
                          <div className="text-xs text-muted-foreground mb-2">Anteprima regole</div>
                          <div
                            className="prose dark:prose-invert prose-sm max-w-none"
                            dangerouslySetInnerHTML={{ __html: renderMarkdownPreview(rulesDraft) }}
                          />
                        </div>
                      )}
                      <div className="flex flex-col sm:flex-row gap-2">
                        <Button
                          className="bg-[var(--azure)] text-primary-foreground"
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
                )}

                {isStaff && (
                  <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
                    <CardContent className="p-6 space-y-4">
                      <h3 className="text-lg font-semibold">Inviti</h3>
                      <div className="grid gap-3 md:grid-cols-3">
                        <div className="space-y-2">
                          <label className="text-xs text-muted-foreground">Ruolo</label>
                          <select
                            value={inviteRole}
                            onChange={(e) => setInviteRole(e.target.value as "member" | "moderator")}
                            className="w-full rounded-md bg-muted/40 dark:bg-white/5 border border-border/60 px-3 py-2 text-sm"
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
                            className="bg-muted/40 dark:bg-white/5 border-border/60"
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
                            className="bg-muted/40 dark:bg-white/5 border-border/60"
                          />
                        </div>
                      </div>
                      <Button
                        className="bg-[var(--gold)] text-slate-900 dark:text-[var(--navy)]"
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
                                className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 rounded-lg border border-border/60 bg-muted/40 dark:bg-white/5 px-3 py-2"
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
                                    variant="outline"
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
                )}

                {isStaff && (
                  <div className="grid gap-6 lg:grid-cols-2">
                    <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
                      <CardContent className="p-6 space-y-4">
                        <h3 className="text-lg font-semibold">Richieste di ingresso</h3>
                        {requests.length === 0 ? (
                          <div className="text-muted-foreground text-sm">Nessuna richiesta in attesa.</div>
                        ) : (
                          <div className="space-y-3">
                            {requests.map((member) => (
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
                                  className="bg-[var(--azure)] text-primary-foreground"
                                  onClick={() => approveRequest.mutate({ clubId, userId: member.user_id })}
                                >
                                  Approva
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
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
                            {bannedMembers.map((member) => (
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
                                  variant="outline"
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
                      const isOwner = post.user_id === club?.owner_id;
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

                              <div className="flex flex-col sm:flex-row gap-3 mb-4">
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

                                <Dialog
                                  open={openCommentsId === post.id}
                                  onOpenChange={(open) => setOpenCommentsId(open ? post.id : null)}
                                >
                                  <DialogTrigger asChild>
                                    <Button
                                      variant="outline"
                                      className="flex-1 flex items-center justify-center gap-2"
                                    >
                                      <MessageCircle className="h-5 w-5" />
                                      <span>Commenti</span>
                                      {post.comment_count > 0 && (
                                        <span className="ml-1 inline-flex items-center justify-center min-w-[22px] h-5 px-2 rounded-full bg-[var(--azure)]/20 text-[var(--azure)] text-xs font-semibold">
                                          {post.comment_count}
                                        </span>
                                      )}
                                    </Button>
                                  </DialogTrigger>
                                  <DialogContent className="max-w-lg bg-[var(--navy)] text-foreground border border-border/60">
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
                                          onClick={() =>
                                            addComment.mutate({
                                              postId: post.id,
                                              content: (commentTextByPost[post.id] ?? "").trim(),
                                            })
                                          }
                                          disabled={addComment.isPending || (commentTextByPost[post.id] ?? "").trim().length === 0}
                                          className="bg-[var(--gold)] text-slate-900 dark:text-[var(--navy)]"
                                        >
                                          Pubblica
                                        </Button>
                                      </div>
                                      <div ref={commentsEndRef} />
                                    </div>
                                  </DialogContent>
                                </Dialog>

                                <Button variant="outline" className="flex-1 flex items-center justify-center gap-2">
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
              </>
            )}
          </div>
        </section>

      </div>
    </AppLayout>
  );
}
