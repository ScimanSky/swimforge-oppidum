import AppLayout from "@/components/AppLayout";
import { Surface, SurfaceContent } from "@/components/ui/surface";
import { renderMarkdownPreview } from "@/lib/markdownPreview";
import { Link } from "wouter";
import termsMarkdown from "../content/legal/terms.md?raw";

export default function Terms() {
  return (
    <AppLayout withShell={false}>
      <div className="mx-auto max-w-4xl space-y-6 px-4 py-10 md:px-6">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
            Torna alla Home
          </Link>
        </div>

        <Surface className="bg-card border-border">
          <SurfaceContent className="prose dark:prose-invert max-w-none p-6">
            <div dangerouslySetInnerHTML={{ __html: renderMarkdownPreview(termsMarkdown) }} />
          </SurfaceContent>
        </Surface>
      </div>
    </AppLayout>
  );
}

