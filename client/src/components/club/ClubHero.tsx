import { motion } from "framer-motion";
import { Users, Settings, ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface ClubHeroProps {
  club: {
    id: number;
    name: string;
    description?: string | null;
    cover_image_url?: string | null;
    theme_color?: string | null;
    logo_url?: string | null;
    tagline?: string | null;
    visibility: string;
    member_count: number;
    member_role?: string | null;
    is_member: boolean;
    owner_id: number;
  };
  onOpenMembers: () => void;
  onOpenSettings: () => void;
  onJoin: () => void;
  onLeave: () => void;
  isJoining?: boolean;
  isLeaving?: boolean;
}

const themeColorMap: Record<string, string> = {
  cyan: "var(--electric-cyan)",
  lime: "var(--electric-lime)",
  coral: "var(--electric-coral)",
  violet: "var(--electric-violet)",
};

export default function ClubHero({ club, onOpenMembers, onOpenSettings, onJoin, onLeave, isJoining, isLeaving }: ClubHeroProps) {
  const color = themeColorMap[club.theme_color ?? "cyan"] ?? themeColorMap.cyan;
  const isStaff = ["owner", "admin", "moderator"].includes(club.member_role ?? "");

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-[26px]"
      style={{ borderColor: color, borderWidth: "1px" }}
    >
      {/* Cover image */}
      <div className="h-32 sm:h-44 bg-gradient-to-br from-surface-panel to-black/60 relative">
        {club.cover_image_url && (
          <img src={club.cover_image_url} alt="" className="absolute inset-0 w-full h-full object-cover opacity-60" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
        {/* Back button */}
        <Link href="/home/community">
          <Button variant="ghost" size="icon" className="absolute top-3 left-3 text-white/80 hover:text-white">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        {/* Action icons */}
        <div className="absolute top-3 right-3 flex gap-2">
          <Button variant="ghost" size="icon" className="text-white/80 hover:text-white" onClick={onOpenMembers}>
            <Users className="h-5 w-5" />
          </Button>
          {isStaff && (
            <Button variant="ghost" size="icon" className="text-white/80 hover:text-white" onClick={onOpenSettings}>
              <Settings className="h-5 w-5" />
            </Button>
          )}
        </div>
      </div>

      {/* Club info overlay */}
      <div className="relative px-4 pb-4 -mt-10">
        <div className="flex items-end gap-3">
          {/* Logo */}
          <Avatar className="h-16 w-16 border-2" style={{ borderColor: color }}>
            <AvatarImage src={club.logo_url ?? undefined} />
            <AvatarFallback style={{ color }} className="text-xl font-bold font-display">
              {club.name.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold font-display truncate" style={{ color }}>
              {club.name}
            </h1>
            {club.tagline && (
              <p className="text-sm text-muted-foreground truncate">{club.tagline}</p>
            )}
          </div>
        </div>

        {/* Meta row */}
        <div className="flex items-center gap-3 mt-3">
          <Badge variant="outline" className="text-xs" style={{ borderColor: color, color }}>
            {club.member_count} membri
          </Badge>
          <Badge variant="outline" className="text-xs capitalize">
            {club.visibility}
          </Badge>
          {club.member_role && (
            <Badge variant="outline" className="text-xs" style={{ borderColor: color, color }}>
              {club.member_role}
            </Badge>
          )}
        </div>

        {/* Join/Leave */}
        {!club.is_member ? (
          <Button className="mt-3 w-full" variant="neon" onClick={onJoin} disabled={isJoining}>
            {isJoining ? "Richiesta..." : club.visibility === "public" ? "Unisciti" : "Richiedi accesso"}
          </Button>
        ) : club.member_role !== "owner" ? (
          <Button className="mt-3" variant="ghost" size="sm" onClick={onLeave} disabled={isLeaving}>
            Lascia club
          </Button>
        ) : null}
      </div>
    </motion.div>
  );
}
