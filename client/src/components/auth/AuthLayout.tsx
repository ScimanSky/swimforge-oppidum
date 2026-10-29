import type { ReactNode } from "react";
import { Link } from "wouter";
import ThemeToggleButton from "@/components/ThemeToggleButton";
import { Wordmark } from "@/components/corsia/Wordmark";

/**
 * Sign-in, sign-up and password pages: public, outside the shell, so the form title is the
 * page's h1. On desktop a flat side panel carries the wordmark and a short line; on phones the
 * wordmark sits above the form. The theme switch stays at the top (no profile here).
 */
export function AuthLayout({
  title,
  description,
  aside,
  children,
  footer,
}: {
  title: string;
  description?: ReactNode;
  /** Desktop side panel: a headline and an optional line or list below it. */
  aside: { headline: string; body?: ReactNode };
  children: ReactNode;
  /** Below the card («Non hai un account? Registrati»). */
  footer?: ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-background pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-foreground">
      <aside className="hidden flex-col justify-between border-r border-border bg-card p-12 lg:flex lg:w-1/2">
        <Link href="/" aria-label="SwimForge, pagina iniziale" className="self-start rounded-lg">
          <Wordmark />
        </Link>
        <div className="max-w-md">
          <p className="font-display text-[40px] font-bold leading-tight">{aside.headline}</p>
          {aside.body ? <div className="mt-3 text-[15px] text-muted-foreground">{aside.body}</div> : null}
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <Link href="/" aria-label="SwimForge, pagina iniziale" className="rounded-lg lg:invisible">
            <Wordmark />
          </Link>
          <ThemeToggleButton />
        </div>
        <div className="flex flex-1 items-center justify-center px-4 pb-10">
          <div className="w-full max-w-md">
            <h1 className="font-display text-[30px] font-bold leading-tight">{title}</h1>
            {description ? (
              <p className="mt-1 text-[15px] text-muted-foreground">{description}</p>
            ) : null}
            <div className="surface-panel mt-5 p-4 sm:p-6">{children}</div>
            {footer ? <p className="mt-5 text-center text-sm text-muted-foreground">{footer}</p> : null}
          </div>
        </div>
      </main>
    </div>
  );
}

/** While `auth.me` says whether the visitor is already signed in (then the page redirects). */
export function AuthPending() {
  return (
    <div role="status" className="min-h-screen bg-background">
      <span className="sr-only">Caricamento…</span>
    </div>
  );
}

/** «oppure» between the form and the Google button. */
export function AuthDivider({ children }: { children: ReactNode }) {
  return (
    <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
      <span className="h-px flex-1 bg-border" aria-hidden />
      {children}
      <span className="h-px flex-1 bg-border" aria-hidden />
    </div>
  );
}

/** Google's «G», in the text colour (no brand colours on a Corsia button). */
export function GoogleIcon() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="currentColor"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="currentColor"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="currentColor"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}
