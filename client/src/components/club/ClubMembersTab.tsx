/**
 * Club members (shown in the members sheet): list, roles and moderation for staff.
 */

import { useId } from "react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/corsia/Chip";
import { LoadingSkeleton } from "@/components/corsia/LoadState";
import { Crown, Shield, User } from "lucide-react";
import { formatInteger } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { errorToastMessage } from "@/lib/trpc-errors";
import { Link } from "wouter";
import { toast } from "sonner";

const ROLES: Record<string, { label: string; icon: typeof User }> = {
  owner: { label: "Proprietario", icon: Crown },
  admin: { label: "Admin", icon: Shield },
  moderator: { label: "Moderatore", icon: Shield },
  member: { label: "Membro", icon: User },
};

interface ClubMembersTabProps {
  clubId: number;
  isStaff?: boolean;
  isOwner?: boolean;
}

export default function ClubMembersTab({ clubId, isStaff, isOwner }: ClubMembersTabProps) {
  const requestsTitleId = useId();
  const bannedTitleId = useId();
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
    onError: (error) => toast.error(errorToastMessage(error, "Impossibile aggiornare il ruolo")),
  });

  const banMemberMutation = trpc.community.clubs.banMember.useMutation({
    onSuccess: async () => {
      toast.success("Membro bannato");
      await refreshAll();
    },
    onError: (error) => toast.error(errorToastMessage(error, "Impossibile bannare il membro")),
  });

  const unbanMemberMutation = trpc.community.clubs.unbanMember.useMutation({
    onSuccess: async () => {
      toast.success("Membro riammesso");
      await refreshAll();
    },
    onError: (error) => toast.error(errorToastMessage(error, "Impossibile riammettere il membro")),
  });

  const approveRequestMutation = trpc.community.clubs.approveRequest.useMutation({
    onSuccess: async () => {
      toast.success("Richiesta approvata");
      await refreshAll();
    },
    onError: (error) => toast.error(errorToastMessage(error, "Impossibile approvare la richiesta")),
  });

  const rejectRequestMutation = trpc.community.clubs.rejectRequest.useMutation({
    onSuccess: async () => {
      toast.success("Richiesta rifiutata");
      await refreshAll();
    },
    onError: (error) => toast.error(errorToastMessage(error, "Impossibile rifiutare la richiesta")),
  });

  const displayName = (member: any) =>
    member.user_name || member.user_username || `Utente #${member.user_id}`;

  // A second way to the profile for the pointer: hidden from the keyboard and screen readers,
  // where the name link next to it is the one stop per member.
  const memberAvatar = (member: any, size: string) => (
    <Link href={`/u/${member.user_id}`} tabIndex={-1} aria-hidden className="shrink-0">
      <Avatar className={size}>
        <AvatarImage src={member.user_avatar || undefined} alt="" />
        <AvatarFallback className="text-sm font-semibold">
          {(member.user_name || member.user_username || "U")?.[0]?.toUpperCase() || "U"}
        </AvatarFallback>
      </Avatar>
    </Link>
  );

  const memberName = (member: any, className: string) => (
    <Link href={`/u/${member.user_id}`} className={`block min-w-0 truncate hover:underline ${className}`}>
      {displayName(member)}
    </Link>
  );

  const memberCount = membersQuery.data?.length ?? 0;

  return (
    <div className="space-y-6">
      <section aria-label="Membri del club">
        {/* Only once loaded: never «0 membri attivi» while loading or after an error. */}
        {membersQuery.data ? (
          <p className="text-sm text-muted-foreground tabular-nums">
            {memberCount === 1 ? "1 membro attivo" : `${formatInteger(memberCount)} membri attivi`}
          </p>
        ) : null}

        {membersQuery.isLoading ? (
          <LoadingSkeleton label="Caricamento dei membri…" count={3} className="mt-2 space-y-2" itemClassName="h-14 w-full rounded-xl" />
        ) : membersQuery.error ? (
          <p className="mt-3 text-sm text-muted-foreground">
            {membersQuery.error.message || "Impossibile caricare i membri"}
          </p>
        ) : (
          <ul className="mt-2">
            {membersQuery.data?.map((member: any) => {
              const role = ROLES[member.role as string];
              return (
                <li key={member.user_id} className="border-t border-border py-3 first:border-t-0">
                  <div className="flex items-center gap-3">
                    {memberAvatar(member, "size-11")}
                    <div className="min-w-0 flex-1">
                      {memberName(member, "font-semibold")}
                      {/* Without a name the username is already the title: no «ada» then «@ada». */}
                      {member.user_name && member.user_username ? (
                        <p className="truncate text-sm text-muted-foreground">@{member.user_username}</p>
                      ) : null}
                    </div>
                    {member.role ? (
                      <Chip tone={member.role === "member" ? "neutral" : "action"}>
                        {role ? <role.icon className="size-3.5" aria-hidden /> : null}
                        {role?.label ?? member.role}
                      </Chip>
                    ) : null}
                  </div>

                  {(isOwner || (isStaff && member.role !== "owner")) && (
                    <div className="mt-3 flex flex-wrap items-center gap-2 pl-14">
                      {isOwner && member.role !== "owner" && (
                        <select
                          aria-label={`Ruolo di ${displayName(member)}`}
                          value={member.role}
                          onChange={(e) =>
                            updateRoleMutation.mutate({
                              clubId,
                              userId: member.user_id,
                              role: e.target.value as "member" | "moderator" | "admin",
                            })
                          }
                          className="h-10 rounded-lg border border-border bg-card px-3 text-sm text-foreground"
                          disabled={updateRoleMutation.isPending}
                        >
                          <option value="member">Membro</option>
                          <option value="moderator">Moderatore</option>
                          <option value="admin">Admin</option>
                        </select>
                      )}

                      {isStaff && member.role !== "owner" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => banMemberMutation.mutate({ clubId, userId: member.user_id })}
                          disabled={banMemberMutation.isPending}
                        >
                          Banna
                        </Button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {isStaff ? (
        <>
          <section aria-labelledby={requestsTitleId} className="border-t border-border pt-4">
            <div className="flex items-center justify-between">
              <h3 id={requestsTitleId} className="text-[17px] font-bold">
                Richieste in attesa
              </h3>
              {requestsQuery.data ? (
                <span className="text-sm text-muted-foreground tabular-nums">{requestsQuery.data.length}</span>
              ) : null}
            </div>
            {requestsQuery.isLoading ? (
              <p className="mt-2 text-sm text-muted-foreground">Caricamento...</p>
            ) : requestsQuery.error ? (
              <p className="mt-2 text-sm text-muted-foreground">{requestsQuery.error.message}</p>
            ) : requestsQuery.data && requestsQuery.data.length > 0 ? (
              <ul className="mt-2">
                {requestsQuery.data.map((member: any) => (
                  <li
                    key={`request-${member.user_id}`}
                    className="flex items-center gap-2 border-t border-border py-2 first:border-t-0"
                  >
                    {memberAvatar(member, "size-8")}
                    {memberName(member, "flex-1 text-sm")}
                    <Button
                      size="sm"
                      onClick={() => approveRequestMutation.mutate({ clubId, userId: member.user_id })}
                      disabled={approveRequestMutation.isPending}
                    >
                      Approva
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => rejectRequestMutation.mutate({ clubId, userId: member.user_id })}
                      disabled={rejectRequestMutation.isPending}
                    >
                      Rifiuta
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">Nessuna richiesta in attesa.</p>
            )}
          </section>

          <section aria-labelledby={bannedTitleId} className="border-t border-border pt-4">
            <div className="flex items-center justify-between">
              <h3 id={bannedTitleId} className="text-[17px] font-bold">
                Membri bannati
              </h3>
              {bannedQuery.data ? (
                <span className="text-sm text-muted-foreground tabular-nums">{bannedQuery.data.length}</span>
              ) : null}
            </div>
            {bannedQuery.isLoading ? (
              <p className="mt-2 text-sm text-muted-foreground">Caricamento...</p>
            ) : bannedQuery.error ? (
              <p className="mt-2 text-sm text-muted-foreground">{bannedQuery.error.message}</p>
            ) : bannedQuery.data && bannedQuery.data.length > 0 ? (
              <ul className="mt-2">
                {bannedQuery.data.map((member: any) => (
                  <li
                    key={`banned-${member.user_id}`}
                    className="flex items-center gap-2 border-t border-border py-2 first:border-t-0"
                  >
                    {memberAvatar(member, "size-8")}
                    {memberName(member, "flex-1 text-sm")}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => unbanMemberMutation.mutate({ clubId, userId: member.user_id })}
                      disabled={unbanMemberMutation.isPending}
                    >
                      Sblocca
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">Nessun membro bannato.</p>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
