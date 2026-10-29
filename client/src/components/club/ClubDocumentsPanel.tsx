import { useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Download, ExternalLink, FileText, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Chip } from "@/components/corsia/Chip";
import { LoadError, LoadingSkeleton } from "@/components/corsia/LoadState";
import { NO_VALUE, formatInteger, formatSessionDate } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { errorToastMessage } from "@/lib/trpc-errors";
import { toast } from "sonner";

type ClubDocumentsPanelProps = {
  clubId: number;
  isMember: boolean;
  canUpload: boolean;
  /** Shown in the description («Da coach e staff di Rari Nantes»). */
  clubName?: string;
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

/** The club's shared PDFs: open or download them; coach and staff upload new ones. */
export default function ClubDocumentsPanel({ clubId, isMember, canUpload, clubName }: ClubDocumentsPanelProps) {
  const utils = trpc.useUtils();
  const titleId = useId();
  const fileInputId = useId();
  const captionInputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  // Reading the file comes before the upload starts: the button stays off for both.
  const [isReadingFile, setIsReadingFile] = useState(false);

  const documentsQuery = trpc.community.clubs.media.list.useQuery(
    { clubId, mediaType: "pdf", limit: 100 },
    { enabled: isMember }
  );

  const uploadPdfMutation = trpc.community.clubs.media.uploadPdfFile.useMutation({
    onSuccess: () => {
      setSelectedFile(null);
      setCaption("");
      // The file input keeps its file name otherwise, as if it were still to upload.
      if (fileInputRef.current) fileInputRef.current.value = "";
      toast.success("PDF caricato con successo.");
      utils.community.clubs.media.list.invalidate({ clubId, mediaType: "pdf", limit: 100 });
    },
    onError: (error) => {
      toast.error(errorToastMessage(error, "Caricamento del PDF non riuscito."));
    },
  });

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

    if (isReadingFile || uploadPdfMutation.isPending) return;
    let base64: string;
    setIsReadingFile(true);
    try {
      base64 = await toBase64(selectedFile);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossibile leggere il file selezionato.");
      return;
    } finally {
      setIsReadingFile(false);
    }
    uploadPdfMutation.mutate({
      clubId,
      caption: caption.trim() || selectedFile.name,
      fileName: selectedFile.name,
      fileBase64: base64,
      mimeType: "application/pdf",
    });
  };

  if (!isMember) return null;

  let list: ReactNode;
  if (documentsQuery.isPending) {
    list = <LoadingSkeleton label="Caricamento dei documenti…" count={3} itemClassName="h-14 w-full rounded-xl" />;
  } else if (!documentsQuery.data && documentsQuery.isError) {
    list = <LoadError className="border-0 bg-raised" onRetry={() => void documentsQuery.refetch()} />;
  } else if (sortedDocs.length === 0) {
    list = <p className="text-sm text-muted-foreground">Nessun PDF condiviso per ora.</p>;
  } else {
    list = (
      <ul>
        {sortedDocs.map((item: any) => {
          const media = item.media;
          const fileName = fileNameFromUrl(media.mediaUrl);
          const title = String(media.caption ?? "").trim() || fileName;
          const createdAt = formatSessionDate(media.createdAt);
          const meta = [
            title !== fileName ? fileName : null,
            `caricato da ${item.uploader?.username || "coach o staff"}`,
            createdAt !== NO_VALUE ? createdAt : null,
          ].filter(Boolean);
          return (
            <li
              key={media.id}
              className="flex flex-col gap-2 border-t border-border py-3 first:border-t-0 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{title}</p>
                <p className="truncate text-xs text-muted-foreground">{meta.join(" · ")}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button variant="outline" size="sm" asChild>
                  <a href={media.mediaUrl} target="_blank" rel="noreferrer" aria-label={`Apri ${title}`}>
                    <ExternalLink aria-hidden />
                    Apri
                  </a>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <a href={media.mediaUrl} download={fileName} aria-label={`Scarica ${title}`}>
                    <Download aria-hidden />
                    Scarica
                  </a>
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <section aria-labelledby={titleId} className="surface-panel p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={titleId} className="inline-flex items-center gap-2 text-[17px] font-bold">
            <FileText className="size-4 text-action-text" aria-hidden />
            PDF condivisi
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {clubName ? `Da coach e staff di ${clubName}` : "Da coach e staff"}: aprili o scaricali.
          </p>
        </div>
        {/* Only once loaded: never «0 PDF» while loading or after an error. */}
        {documentsQuery.data ? <Chip>{formatInteger(documentsQuery.data.length)} PDF</Chip> : null}
      </div>

      {canUpload ? (
        <div className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-[1.2fr_1.8fr_auto] sm:items-end">
          <div className="space-y-1">
            <Label htmlFor={fileInputId}>File PDF</Label>
            <Input
              ref={fileInputRef}
              id={fileInputId}
              type="file"
              accept="application/pdf,.pdf"
              onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={captionInputId}>Titolo o nota</Label>
            <Input
              id={captionInputId}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Es. Programma gare marzo 2026"
            />
          </div>
          <Button onClick={handleUpload} disabled={!selectedFile || isReadingFile || uploadPdfMutation.isPending}>
            <Upload aria-hidden />
            {isReadingFile || uploadPdfMutation.isPending ? "Caricamento…" : "Carica PDF"}
          </Button>
        </div>
      ) : null}

      <div className="mt-4 border-t border-border pt-4">{list}</div>
    </section>
  );
}
