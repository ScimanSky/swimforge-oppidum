/**
 * Club Members Tab - Lista membri del club + moderazione
 */

import { Surface, SurfaceContent } from "@/components/ui/surface";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Crown, Shield, User } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import { toast } from "sonner";

interface ClubMembersTabProps {
  clubId: number;
  isStaff?: boolean;
  isOwner?: boolean;
}

export default function ClubMembersTab({ clubId, isStaff, isOwner }: ClubMembersTabProps) {
  const utils = trpc.useUtils();
  const membersQuery = trpc.community.clubs.members.useQuery({ clubId });
  const requestsQuery = trpc.community.clubs.requests.useQuery(
    { clubId },
    { enabled: Boolean(isStaff) }
  );
  const bannedQuery = trpc.community.clubs.banned.useQuery(
    { clubId },
    { enabled: Boolean(isStaff) }
  );

  const refreshAll = async () => {
    await Promise.all([
      utils.community.clubs.members.invalidate({ clubId }),
      utils.community.clubs.requests.invalidate({ clubId }),
      utils.community.clubs.banned.invalidate({ clubId }),
      utils.community.clubs.get.invalidate({ clubId }),
    ]);
  };

  const updateRoleMutation = trpc.community.clubs.updateMemberRole.useMutation({
    onSuccess: async () => {
      toast.success("Ruolo aggiornato");
      await refreshAll();
    },
    onError: (error) => toast.error(error.message || "Impossibile aggiornare il ruolo"),
  });

  const banMemberMutation = trpc.community.clubs.banMember.useMutation({
    onSuccess: async () => {
      toast.success("Membro bannato");
      await refreshAll();
    },
    onError: (error) => toast.error(error.message || "Impossibile bannare il membro"),
  });

  const unbanMemberMutation = trpc.community.clubs.unbanMember.useMutation({
    onSuccess: async () => {
      toast.success("Membro riammesso");
      await refreshAll();
    },
    onError: (error) => toast.error(error.message || "Impossibile riammettere il membro"),
  });

  const approveRequestMutation = trpc.community.clubs.approveRequest.useMutation({
    onSuccess: async () => {
      toast.success("Richiesta approvata");
      await refreshAll();
    },
    onError: (error) => toast.error(error.message || "Impossibile approvare la richiesta"),
  });

  const rejectRequestMutation = trpc.community.clubs.rejectRequest.useMutation({
    onSuccess: async () => {
      toast.success("Richiesta rifiutata");
      await refreshAll();
    },
    onError: (error) => toast.error(error.message || "Impossibile rifiutare la richiesta"),
  });

  const getRoleIcon = (role: string) => {
    switch (role) {
      case "owner":
        return <Crown className="h-4 w-4" />;
      case "admin":
      case "moderator":
        return <Shield className="h-4 w-4" />;
      default:
        return <User className="h-4 w-4" />;
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case "owner":
        return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
      case "admin":
        return "bg-red-500/10 text-red-500 border-red-500/20";
      case "moderator":
        return "bg-blue-500/10 text-blue-500 border-blue-500/20";
      default:
        return "";
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold mb-2">Membri del Club</h2>
        <p className="text-muted-foreground">
          {membersQuery.data?.length || 0} membri attivi
        </p>
      </div>

      {membersQuery.isLoading ? (
        <Surface>
          <SurfaceContent className="p-8 flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </SurfaceContent>
        </Surface>
      ) : membersQuery.error ? (
        <Surface>
          <SurfaceContent className="p-4 text-sm text-muted-foreground">
            {membersQuery.error.message || "Impossibile caricare i membri"}
          </SurfaceContent>
        </Surface>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {membersQuery.data?.map((member: any) => (
            <Surface key={member.user_id}>
              <SurfaceContent className="p-4">
                <div className="flex items-center gap-3">
                  <Link href={`/u/${member.user_id}`}>
                    <Avatar className="h-12 w-12 cursor-pointer">
                      <AvatarImage src={member.user_avatar || undefined} />
                      <AvatarFallback>
                        {(member.user_name || member.user_email?.split("@")[0] || "U")?.[0]?.toUpperCase() || "U"}
                      </AvatarFallback>
                    </Avatar>
                  </Link>
                  <div className="flex-1 min-w-0">
                    <Link href={`/u/${member.user_id}`} className="font-semibold truncate block hover:underline">
                      {member.user_name || member.user_email?.split("@")[0] || `Utente #${member.user_id}`}
                    </Link>
                    {member.user_email && (
                      <p className="text-sm text-muted-foreground truncate">{member.user_email}</p>
                    )}
                    {member.role && (
                      <Badge
                        variant="outline"
                        className={`mt-1 capitalize ${getRoleColor(member.role)}`}
                      >
                        {getRoleIcon(member.role)}
                        <span className="ml-1">{member.role}</span>
                      </Badge>
                    )}
                  </div>
                </div>

                {(isOwner || (isStaff && member.role !== "owner")) && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {isOwner && member.role !== "owner" && (
                      <select
                        value={member.role}
                        onChange={(e) =>
                          updateRoleMutation.mutate({
                            clubId,
                            userId: member.user_id,
                            role: e.target.value as "member" | "moderator" | "admin",
                          })
                        }
                        className="h-8 rounded-md border border-border/70 bg-background px-2 text-xs"
                        disabled={updateRoleMutation.isPending}
                      >
                        <option value="member">Membro</option>
                        <option value="moderator">Moderatore</option>
                        <option value="admin">Admin</option>
                      </select>
                    )}

                    {isStaff && member.role !== "owner" && (
                      <Button
                        variant="outline-neon"
                        size="sm"
                        className="h-8"
                        onClick={() => banMemberMutation.mutate({ clubId, userId: member.user_id })}
                        disabled={banMemberMutation.isPending}
                      >
                        Banna
                      </Button>
                    )}
                  </div>
                )}
              </SurfaceContent>
            </Surface>
          ))}
        </div>
      )}

      {isStaff ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Surface>
            <SurfaceContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Richieste in attesa</h3>
                <span className="text-xs text-muted-foreground">{requestsQuery.data?.length ?? 0}</span>
              </div>
              {requestsQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Caricamento...</p>
              ) : requestsQuery.error ? (
                <p className="text-sm text-muted-foreground">{requestsQuery.error.message}</p>
              ) : requestsQuery.data && requestsQuery.data.length > 0 ? (
                <div className="space-y-2">
                  {requestsQuery.data.map((member: any) => (
                    <div key={`request-${member.user_id}`} className="flex items-center gap-2 rounded-lg border border-border/60 p-2">
                      <Link href={`/u/${member.user_id}`}>
                        <Avatar className="h-8 w-8 cursor-pointer">
                          <AvatarImage src={member.user_avatar || undefined} />
                          <AvatarFallback>
                            {(member.user_name || member.user_email?.split("@")[0] || "U")?.[0]?.toUpperCase() || "U"}
                          </AvatarFallback>
                        </Avatar>
                      </Link>
                      <div className="flex-1 min-w-0 text-sm truncate">
                        {member.user_name || member.user_email?.split("@")[0] || `Utente #${member.user_id}`}
                      </div>
                      <Button
                        size="sm"
                        className="h-7"
                        variant="neon"
                        onClick={() => approveRequestMutation.mutate({ clubId, userId: member.user_id })}
                        disabled={approveRequestMutation.isPending}
                      >
                        Approva
                      </Button>
                      <Button
                        size="sm"
                        className="h-7"
                        variant="outline-neon"
                        onClick={() => rejectRequestMutation.mutate({ clubId, userId: member.user_id })}
                        disabled={rejectRequestMutation.isPending}
                      >
                        Rifiuta
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Nessuna richiesta in attesa.</p>
              )}
            </SurfaceContent>
          </Surface>

          <Surface>
            <SurfaceContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Membri bannati</h3>
                <span className="text-xs text-muted-foreground">{bannedQuery.data?.length ?? 0}</span>
              </div>
              {bannedQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Caricamento...</p>
              ) : bannedQuery.error ? (
                <p className="text-sm text-muted-foreground">{bannedQuery.error.message}</p>
              ) : bannedQuery.data && bannedQuery.data.length > 0 ? (
                <div className="space-y-2">
                  {bannedQuery.data.map((member: any) => (
                    <div key={`banned-${member.user_id}`} className="flex items-center gap-2 rounded-lg border border-border/60 p-2">
                      <Link href={`/u/${member.user_id}`}>
                        <Avatar className="h-8 w-8 cursor-pointer">
                          <AvatarImage src={member.user_avatar || undefined} />
                          <AvatarFallback>
                            {(member.user_name || member.user_email?.split("@")[0] || "U")?.[0]?.toUpperCase() || "U"}
                          </AvatarFallback>
                        </Avatar>
                      </Link>
                      <div className="flex-1 min-w-0 text-sm truncate">
                        {member.user_name || member.user_email?.split("@")[0] || `Utente #${member.user_id}`}
                      </div>
                      <Button
                        size="sm"
                        className="h-7"
                        variant="outline-neon"
                        onClick={() => unbanMemberMutation.mutate({ clubId, userId: member.user_id })}
                        disabled={unbanMemberMutation.isPending}
                      >
                        Sblocca
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Nessun membro bannato.</p>
              )}
            </SurfaceContent>
          </Surface>
        </div>
      ) : null}
    </div>
  );
}
