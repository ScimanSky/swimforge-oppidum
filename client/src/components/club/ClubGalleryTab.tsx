/**
 * Club Gallery Tab - Galleria foto e video
 */

import { useState } from "react";
import { Surface, SurfaceContent } from "@/components/ui/surface";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Images, Upload, Image as ImageIcon, Video } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface ClubGalleryTabProps {
  clubId: number;
  isMember?: boolean;
}

export default function ClubGalleryTab({ clubId, isMember }: ClubGalleryTabProps) {
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [newMedia, setNewMedia] = useState({
    mediaUrl: "",
    caption: "",
    mediaType: "image" as "image" | "video",
  });

  const utils = trpc.useUtils();

  const galleryQuery = trpc.community.clubs.media.list.useQuery({
    clubId,
    limit: 50,
  });

  const uploadMutation = trpc.community.clubs.media.upload.useMutation({
    onSuccess: () => {
      toast.success("Media caricato!");
      setIsUploadOpen(false);
      setNewMedia({ mediaUrl: "", caption: "", mediaType: "image" });
      utils.community.clubs.media.list.invalidate({ clubId });
    },
  });

  const handleUpload = () => {
    if (!newMedia.mediaUrl) {
      toast.error("URL media richiesto");
      return;
    }
    uploadMutation.mutate({
      clubId,
      ...newMedia,
    });
  };

  if (!isMember) {
    return (
      <Surface>
        <SurfaceContent className="p-8 text-center">
          <Images className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">
            Unisciti al club per vedere la galleria
          </p>
        </SurfaceContent>
      </Surface>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Galleria</h2>
          <p className="text-muted-foreground">
            {galleryQuery.data?.length || 0} foto e video
          </p>
        </div>
        <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
          <DialogTrigger asChild>
            <Button>
              <Upload className="mr-2 h-4 w-4" />
              Carica Media
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Carica Foto o Video</DialogTitle>
              <DialogDescription>
                Inserisci URL e descrizione per aggiungere media alla galleria del club.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="mediaUrl">URL Media *</Label>
                <Input
                  id="mediaUrl"
                  value={newMedia.mediaUrl}
                  onChange={(e) => setNewMedia({ ...newMedia, mediaUrl: e.target.value })}
                  placeholder="https://..."
                />
              </div>
              <div>
                <Label htmlFor="caption">Didascalia</Label>
                <Textarea
                  id="caption"
                  value={newMedia.caption}
                  onChange={(e) => setNewMedia({ ...newMedia, caption: e.target.value })}
                  placeholder="Descrivi il media..."
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsUploadOpen(false)}>
                Annulla
              </Button>
              <Button onClick={handleUpload} disabled={uploadMutation.isPending}>
                Carica
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {galleryQuery.isLoading ? (
        <Surface>
          <SurfaceContent className="p-8 flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </SurfaceContent>
        </Surface>
      ) : !galleryQuery.data || galleryQuery.data.length === 0 ? (
        <Surface>
          <SurfaceContent className="p-8 text-center">
            <Images className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">Nessun media ancora</p>
          </SurfaceContent>
        </Surface>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {galleryQuery.data.map((item: any) => (
            <Surface key={item.media.id} className="overflow-hidden group cursor-pointer hover:shadow-lg transition-all">
              <div className="aspect-square bg-muted relative">
                {item.media.mediaType === "image" ? (
                  <img
                    src={item.media.mediaUrl}
                    alt={item.media.caption || ""}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Video className="h-12 w-12 text-muted-foreground" />
                  </div>
                )}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <p className="text-white text-sm text-center px-2">
                    {item.media.caption || "Nessuna didascalia"}
                  </p>
                </div>
              </div>
            </Surface>
          ))}
        </div>
      )}
    </div>
  );
}
