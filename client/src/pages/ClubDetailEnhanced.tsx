/**
 * Enhanced Club Detail Page con Tab System
 * Tabs: Feed, Eventi, Membri, Galleria, Annunci
 */

import { useState } from "react";
import { Link, useRoute } from "wouter";
import { motion } from "framer-motion";
import { 
  ArrowLeft, Calendar, Users, Images, Megaphone, 
  Settings, MessageCircle, Bell, TrendingUp
} from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

// Sub-components
import ClubFeedTab from "@/components/club/ClubFeedTab";
import ClubEventsTab from "@/components/club/ClubEventsTab";
import ClubMembersTab from "@/components/club/ClubMembersTab";
import ClubGalleryTab from "@/components/club/ClubGalleryTab";
import ClubAnnouncementsTab from "@/components/club/ClubAnnouncementsTab";
import ClubStatsTab from "@/components/club/ClubStatsTab";

export default function ClubDetailEnhanced() {
  const [match, params] = useRoute("/community/club/:id");
  const clubId = Number(params?.id);
  const [activeTab, setActiveTab] = useState("feed");

  const utils = trpc.useUtils();

  const clubQuery = trpc.community.clubs.get.useQuery(
    { clubId },
    { enabled: match && Number.isFinite(clubId) }
  );

  const membersQuery = trpc.community.clubs.members.useQuery(
    { clubId },
    { enabled: !!clubQuery.data }
  );

  const club = clubQuery.data;
  const isStaff = club?.member_role && ["owner", "admin", "moderator"].includes(club.member_role);
  const isOwner = club?.member_role === "owner";
  const isMember = club?.is_member;

  const joinMutation = trpc.community.clubs.join.useMutation({
    onSuccess: () => {
      toast.success("Richiesta di iscrizione inviata!");
      utils.community.clubs.get.invalidate({ clubId });
    },
  });

  const leaveMutation = trpc.community.clubs.leave.useMutation({
    onSuccess: () => {
      toast.success("Hai lasciato il club");
      utils.community.clubs.get.invalidate({ clubId });
    },
  });

  if (!match || !Number.isFinite(clubId)) {
    return (
      <AppLayout>
        <div className="min-h-screen flex items-center justify-center">
          <p className="text-muted-foreground">Club non trovato</p>
        </div>
      </AppLayout>
    );
  }

  if (clubQuery.isLoading) {
    return (
      <AppLayout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
        </div>
      </AppLayout>
    );
  }

  if (!club) {
    return (
      <AppLayout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <p className="text-muted-foreground mb-4">Club non trovato</p>
            <Link href="/community">
              <Button variant="outline">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Torna alla Community
              </Button>
            </Link>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="min-h-screen pb-20">
        {/* Header with Cover Image */}
        <div className="relative">
          {club.cover_image_url ? (
            <div 
              className="w-full h-64 bg-cover bg-center"
              style={{ backgroundImage: `url(${club.cover_image_url})` }}
            >
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/30 to-background" />
            </div>
          ) : (
            <div className="w-full h-64 bg-gradient-to-br from-blue-500 via-cyan-500 to-teal-500">
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/30 to-background" />
            </div>
          )}
          
          {/* Back Button */}
          <Link href="/community">
            <Button
              variant="ghost"
              size="sm"
              className="absolute top-4 left-4 bg-background/80 backdrop-blur-sm hover:bg-background/90"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Indietro
            </Button>
          </Link>

          {/* Settings Button (for staff) */}
          {isStaff && (
            <Button
              variant="ghost"
              size="sm"
              className="absolute top-4 right-4 bg-background/80 backdrop-blur-sm hover:bg-background/90"
            >
              <Settings className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Club Info Bar */}
        <div className="container max-w-6xl mx-auto px-4 -mt-16 relative z-10">
          <Card className="border-2">
            <CardContent className="p-6">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h1 className="text-3xl font-bold">{club.name}</h1>
                    {club.visibility === "private" && (
                      <Badge variant="secondary">Privato</Badge>
                    )}
                    {club.visibility === "invite" && (
                      <Badge variant="secondary">Solo Invito</Badge>
                    )}
                  </div>
                  {club.description && (
                    <p className="text-muted-foreground mb-3">{club.description}</p>
                  )}
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Users className="h-4 w-4" />
                      <span>{club.member_count} membri</span>
                    </div>
                    {club.member_role && (
                      <Badge variant="outline" className="capitalize">
                        {club.member_role}
                      </Badge>
                    )}
                  </div>
                </div>
                
                <div className="flex gap-2">
                  {!isMember ? (
                    <Button
                      onClick={() => joinMutation.mutate({ clubId })}
                      disabled={joinMutation.isPending}
                      size="lg"
                    >
                      {joinMutation.isPending ? "..." : "Unisciti al Club"}
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      onClick={() => {
                        if (confirm("Sicuro di voler lasciare il club?")) {
                          leaveMutation.mutate({ clubId });
                        }
                      }}
                      disabled={leaveMutation.isPending}
                    >
                      Lascia Club
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs Navigation */}
        <div className="container max-w-6xl mx-auto px-4 mt-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-6 lg:w-auto lg:inline-flex mb-6">
              <TabsTrigger value="feed" className="gap-2">
                <MessageCircle className="h-4 w-4" />
                <span className="hidden sm:inline">Feed</span>
              </TabsTrigger>
              <TabsTrigger value="events" className="gap-2">
                <Calendar className="h-4 w-4" />
                <span className="hidden sm:inline">Eventi</span>
              </TabsTrigger>
              <TabsTrigger value="members" className="gap-2">
                <Users className="h-4 w-4" />
                <span className="hidden sm:inline">Membri</span>
              </TabsTrigger>
              <TabsTrigger value="gallery" className="gap-2">
                <Images className="h-4 w-4" />
                <span className="hidden sm:inline">Galleria</span>
              </TabsTrigger>
              <TabsTrigger value="announcements" className="gap-2">
                <Megaphone className="h-4 w-4" />
                <span className="hidden sm:inline">Annunci</span>
              </TabsTrigger>
              <TabsTrigger value="stats" className="gap-2">
                <TrendingUp className="h-4 w-4" />
                <span className="hidden sm:inline">Stats</span>
              </TabsTrigger>
            </TabsList>

            {/* Tab Content */}
            <TabsContent value="feed" className="mt-0">
              <ClubFeedTab clubId={clubId} isMember={isMember} />
            </TabsContent>

            <TabsContent value="events" className="mt-0">
              <ClubEventsTab clubId={clubId} isMember={isMember} isStaff={isStaff} />
            </TabsContent>

            <TabsContent value="members" className="mt-0">
              <ClubMembersTab clubId={clubId} isStaff={isStaff} isOwner={isOwner} />
            </TabsContent>

            <TabsContent value="gallery" className="mt-0">
              <ClubGalleryTab clubId={clubId} isMember={isMember} />
            </TabsContent>

            <TabsContent value="announcements" className="mt-0">
              <ClubAnnouncementsTab clubId={clubId} isStaff={isStaff} />
            </TabsContent>

            <TabsContent value="stats" className="mt-0">
              <ClubStatsTab clubId={clubId} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </AppLayout>
  );
}
