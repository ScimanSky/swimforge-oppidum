/**
 * Club Members Tab - Lista membri del club
 */

import { Surface, SurfaceContent } from "@/components/ui/surface";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, Crown, Shield, User } from "lucide-react";
import { trpc } from "@/lib/trpc";

interface ClubMembersTabProps {
  clubId: number;
  isStaff?: boolean;
  isOwner?: boolean;
}

export default function ClubMembersTab({ clubId, isStaff, isOwner }: ClubMembersTabProps) {
  const membersQuery = trpc.community.clubs.members.useQuery({ clubId });

  const getRoleIcon = (role: string) => {
    switch (role) {
      case "owner":
        return <Crown className="h-4 w-4" />;
      case "admin":
        return <Shield className="h-4 w-4" />;
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
          {membersQuery.data?.length || 0} membri totali
        </p>
      </div>

      {membersQuery.isLoading ? (
        <Surface>
          <SurfaceContent className="p-8 flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </SurfaceContent>
        </Surface>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {membersQuery.data?.map((member: any) => (
            <Surface key={member.id}>
              <SurfaceContent className="p-4">
                <div className="flex items-center gap-3">
                  <Avatar className="h-12 w-12">
                    <AvatarImage src={member.profile_picture || undefined} />
                    <AvatarFallback>
                      {member.username?.[0]?.toUpperCase() || "U"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{member.username}</p>
                    {member.full_name && (
                      <p className="text-sm text-muted-foreground truncate">
                        {member.full_name}
                      </p>
                    )}
                    {member.role && member.role !== "member" && (
                      <Badge
                        variant="outline"
                        className={`mt-1 capitalize ${getRoleColor(member.role)}`}
                      >
                        {getRoleIcon(member.role)}
                        <span className="ml-1">{member.role}</span>
                      </Badge>
                    )}
                  </div>
                  {isStaff && member.role !== "owner" && (
                    <Button variant="ghost" size="sm">
                      Gestisci
                    </Button>
                  )}
                </div>
              </SurfaceContent>
            </Surface>
          ))}
        </div>
      )}
    </div>
  );
}
