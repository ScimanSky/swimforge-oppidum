/**
 * Club Announcements Tab - Annunci importanti
 */

import { useState } from "react";
import { Surface, SurfaceContent } from "@/components/ui/surface";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Megaphone, Pin, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface ClubAnnouncementsTabProps {
  clubId: number;
  isStaff?: boolean;
}

export default function ClubAnnouncementsTab({ clubId, isStaff }: ClubAnnouncementsTabProps) {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newAnnouncement, setNewAnnouncement] = useState({
    title: "",
    content: "",
    isPinned: false,
  });

  const utils = trpc.useUtils();

  const announcementsQuery = trpc.community.clubs.announcements.list.useQuery({
    clubId,
  });

  const createMutation = trpc.community.clubs.announcements.create.useMutation({
    onSuccess: () => {
      toast.success("Annuncio creato!");
      setIsCreateOpen(false);
      setNewAnnouncement({ title: "", content: "", isPinned: false });
      utils.community.clubs.announcements.list.invalidate({ clubId });
    },
  });

  const handleCreate = () => {
    if (!newAnnouncement.title || !newAnnouncement.content) {
      toast.error("Titolo e contenuto sono obbligatori");
      return;
    }
    createMutation.mutate({
      clubId,
      ...newAnnouncement,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Annunci</h2>
          <p className="text-muted-foreground">
            Informazioni importanti del club
          </p>
        </div>
        {isStaff && (
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Nuovo Annuncio
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Crea Annuncio</DialogTitle>
                <DialogDescription>
                  Pubblica un aggiornamento importante per i membri del club.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="title">Titolo *</Label>
                  <Input
                    id="title"
                    value={newAnnouncement.title}
                    onChange={(e) => setNewAnnouncement({ ...newAnnouncement, title: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="content">Contenuto *</Label>
                  <Textarea
                    id="content"
                    value={newAnnouncement.content}
                    onChange={(e) => setNewAnnouncement({ ...newAnnouncement, content: e.target.value })}
                    rows={6}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="isPinned"
                    checked={newAnnouncement.isPinned}
                    onChange={(e) => setNewAnnouncement({ ...newAnnouncement, isPinned: e.target.checked })}
                    className="rounded"
                  />
                  <Label htmlFor="isPinned">Fissa in alto</Label>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                  Annulla
                </Button>
                <Button onClick={handleCreate} disabled={createMutation.isPending}>
                  Crea
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {announcementsQuery.isLoading ? (
        <Surface>
          <SurfaceContent className="p-8 flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </SurfaceContent>
        </Surface>
      ) : !announcementsQuery.data || announcementsQuery.data.length === 0 ? (
        <Surface>
          <SurfaceContent className="p-8 text-center">
            <Megaphone className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">Nessun annuncio</p>
          </SurfaceContent>
        </Surface>
      ) : (
        <div className="space-y-4">
          {announcementsQuery.data.map((item: any) => (
            <Surface key={item.announcement.id} className={item.announcement.isPinned ? "border-primary" : ""}>
              <SurfaceContent className="p-6">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <h3 className="text-lg font-semibold flex-1">{item.announcement.title}</h3>
                  {item.announcement.isPinned && (
                    <Badge variant="secondary" className="gap-1">
                      <Pin className="h-3 w-3" />
                      Fissato
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap mb-3">
                  {item.announcement.content}
                </p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>Da {item.author.username}</span>
                  <span>•</span>
                  <span>{new Date(item.announcement.createdAt).toLocaleDateString("it-IT")}</span>
                </div>
              </SurfaceContent>
            </Surface>
          ))}
        </div>
      )}
    </div>
  );
}
