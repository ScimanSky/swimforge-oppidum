import { useMemo, useState } from "react";
import { Download, ExternalLink, FileText, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

type ClubDocumentsPanelProps = {
  clubId: number;
  isMember: boolean;
  canUpload: boolean;
};

function fileNameFromUrl(url: string) {
  try {
    const pathname = new URL(url).pathname;
    const last = decodeURIComponent(pathname.split("/").filter(Boolean).pop() ?? "documento.pdf");
    return last.replace(/^\d+-/, "");
  } catch {
    return "documento.pdf";
  }
}

async function toBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const raw = String(reader.result ?? "");
      const commaIndex = raw.indexOf(",");
      resolve(commaIndex >= 0 ? raw.slice(commaIndex + 1) : raw);
    };
    reader.onerror = () => reject(new Error("Impossibile leggere il file selezionato."));
    reader.readAsDataURL(file);
  });
}

export default function ClubDocumentsPanel({ clubId, isMember, canUpload }: ClubDocumentsPanelProps) {
  const utils = trpc.useUtils();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");

  const documentsQuery = trpc.community.clubs.media.list.useQuery(
    { clubId, mediaType: "pdf", limit: 100 },
    { enabled: isMember }
  );

  const uploadPdfMutation = trpc.community.clubs.media.uploadPdfFile.useMutation({
    onSuccess: () => {
      setSelectedFile(null);
      setCaption("");
      toast.success("PDF caricato con successo.");
      utils.community.clubs.media.list.invalidate({ clubId, mediaType: "pdf", limit: 100 });
    },
    onError: (error) => {
      toast.error(error.message || "Upload PDF non riuscito.");
    },
  });

  const docsCount = documentsQuery.data?.length ?? 0;
  const sortedDocs = useMemo(() => {
    return (documentsQuery.data ?? []).slice().sort((a: any, b: any) => {
      return new Date(b.media.createdAt).getTime() - new Date(a.media.createdAt).getTime();
    });
  }, [documentsQuery.data]);

  const handleUpload = async () => {
    if (!selectedFile) {
      toast.error("Seleziona un file PDF.");
      return;
    }
    if (selectedFile.type !== "application/pdf" && !selectedFile.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Formato non valido: carica un PDF.");
      return;
    }
    if (selectedFile.size > 15 * 1024 * 1024) {
      toast.error("File troppo grande (max 15MB).");
      return;
    }

    const base64 = await toBase64(selectedFile);
    uploadPdfMutation.mutate({
      clubId,
      caption: caption.trim() || selectedFile.name,
      fileName: selectedFile.name,
      fileBase64: base64,
      mimeType: "application/pdf",
    });
  };

  if (!isMember) return null;

  return (
    <section className="surface-panel p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="inline-flex items-center gap-2 text-xs font-display uppercase tracking-wide text-muted-foreground">
            <FileText className="h-4 w-4 text-primary" />
            Documenti Club
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            PDF condivisi dal coach/staff. Apribili e scaricabili dagli iscritti.
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-border/60 px-2 py-0.5 text-[11px] text-muted-foreground">
          {docsCount} PDF
        </span>
      </div>

      {canUpload ? (
        <div className="mt-3 rounded-xl border border-border/60 bg-card/35 p-3">
          <div className="grid gap-2 sm:grid-cols-[1.2fr_1.8fr_auto] sm:items-end">
            <div className="space-y-1">
              <Label htmlFor={`club-pdf-${clubId}`}>Allega PDF</Label>
              <Input
                id={`club-pdf-${clubId}`}
                type="file"
                accept="application/pdf,.pdf"
                onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`club-pdf-caption-${clubId}`}>Titolo / Nota</Label>
              <Input
                id={`club-pdf-caption-${clubId}`}
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Es. Programma gare marzo 2026"
              />
            </div>
            <Button
              variant="neon"
              onClick={handleUpload}
              disabled={!selectedFile || uploadPdfMutation.isPending}
              className="sm:mb-[1px]"
            >
              <Upload className="mr-1.5 h-4 w-4" />
              {uploadPdfMutation.isPending ? "Caricamento..." : "Carica PDF"}
            </Button>
          </div>
        </div>
      ) : null}

      {documentsQuery.isLoading ? (
        <div className="mt-3 text-xs text-muted-foreground">Caricamento documenti...</div>
      ) : sortedDocs.length === 0 ? (
        <div className="mt-3 rounded-xl border border-border/60 bg-card/40 p-3 text-sm text-muted-foreground">
          Nessun PDF condiviso al momento.
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          {sortedDocs.map((item: any) => {
            const media = item.media;
            const title = String(media.caption ?? "").trim() || fileNameFromUrl(media.mediaUrl);
            const fileName = fileNameFromUrl(media.mediaUrl);
            const createdAtLabel = new Date(media.createdAt).toLocaleString("it-IT");
            const uploaderLabel = item.uploader?.username || "coach/staff";
            return (
              <div
                key={media.id}
                className="flex flex-col gap-2 rounded-xl border border-border/60 bg-card/35 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {fileName} • caricato da {uploaderLabel} • {createdAtLabel}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <a href={media.mediaUrl} target="_blank" rel="noreferrer">
                    <Button variant="outline-neon" size="sm">
                      <ExternalLink className="mr-1.5 h-4 w-4" />
                      Apri
                    </Button>
                  </a>
                  <a href={media.mediaUrl} download={fileName}>
                    <Button variant="outline-neon" size="sm">
                      <Download className="mr-1.5 h-4 w-4" />
                      Scarica
                    </Button>
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

