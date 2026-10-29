import { useMemo } from "react";
import { Link } from "wouter";
import { ChevronLeft } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { renderMarkdownPreview, splitMarkdownTitle } from "@/lib/markdownPreview";

/**
 * A public legal document (privacy, terms, cookies): outside the shell, so the document title
 * is the page's h1; the text comes from the Markdown file unchanged.
 */
export default function LegalPage({ markdown }: { markdown: string }) {
  const { title, html } = useMemo(() => {
    const { title, body } = splitMarkdownTitle(markdown);
    return { title, html: renderMarkdownPreview(body) };
  }, [markdown]);

  return (
    <AppLayout withShell={false}>
      <main className="mx-auto max-w-3xl px-4 py-6 md:px-6 md:py-10">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-action-text hover:underline"
        >
          <ChevronLeft className="size-4" aria-hidden />
          Torna alla home
        </Link>
        <article className="surface-panel mt-2 p-4 sm:p-6">
          <h1 className="font-display text-[30px] font-bold leading-tight">{title}</h1>
          <div className="legal-prose mt-4" dangerouslySetInnerHTML={{ __html: html }} />
        </article>
      </main>
    </AppLayout>
  );
}
