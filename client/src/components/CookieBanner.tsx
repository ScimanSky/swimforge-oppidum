import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";

const COOKIE_CONSENT_STORAGE_KEY = "swimforge:cookie-consent:v1";

type CookiePreferences = {
  necessary: true;
  functional: boolean;
  analytics: boolean;
  marketing: boolean;
  decidedAt: string;
};

function readCookiePreferences(): CookiePreferences | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CookiePreferences>;
    if (typeof parsed.analytics !== "boolean" || typeof parsed.marketing !== "boolean") return null;
    return {
      necessary: true,
      functional: typeof parsed.functional === "boolean" ? parsed.functional : true,
      analytics: parsed.analytics,
      marketing: parsed.marketing,
      decidedAt: typeof parsed.decidedAt === "string" ? parsed.decidedAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

function writeCookiePreferences(value: CookiePreferences) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, JSON.stringify(value));
}

export function openCookiePreferencesPanel() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("swimforge:open-cookie-preferences"));
}

export default function CookieBanner() {
  const meQuery = trpc.auth.me.useQuery(undefined, { retry: false });
  const consentBulkMutation = trpc.consent.setBulk.useMutation();

  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [showCustomize, setShowCustomize] = useState(false);
  const [draft, setDraft] = useState({
    functional: true,
    analytics: false,
    marketing: false,
  });

  useEffect(() => {
    const existing = readCookiePreferences();
    if (existing) {
      setDraft({
        functional: existing.functional,
        analytics: existing.analytics,
        marketing: existing.marketing,
      });
      setOpen(false);
    } else {
      setOpen(true);
    }
    setReady(true);
  }, []);

  useEffect(() => {
    const openHandler = () => {
      const existing = readCookiePreferences();
      if (existing) {
        setDraft({
          functional: existing.functional,
          analytics: existing.analytics,
          marketing: existing.marketing,
        });
      }
      setShowCustomize(true);
      setOpen(true);
    };

    window.addEventListener("swimforge:open-cookie-preferences", openHandler);
    return () => window.removeEventListener("swimforge:open-cookie-preferences", openHandler);
  }, []);

  const canPersistServer = useMemo(() => Boolean(meQuery.data?.id), [meQuery.data?.id]);

  const persist = async (choices: { functional: boolean; analytics: boolean; marketing: boolean }) => {
    const payload: CookiePreferences = {
      necessary: true,
      functional: choices.functional,
      analytics: choices.analytics,
      marketing: choices.marketing,
      decidedAt: new Date().toISOString(),
    };
    writeCookiePreferences(payload);

    if (canPersistServer) {
      await consentBulkMutation.mutateAsync({
        items: [
          { consentType: "cookie_analytics", granted: choices.analytics },
          { consentType: "marketing_communications", granted: choices.marketing },
        ],
      });
    }

    setOpen(false);
    setShowCustomize(false);
  };

  if (!ready || !open) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[85] px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] md:px-6">
      <section className="mx-auto w-full max-w-4xl rounded-2xl border border-border/80 bg-background/95 p-4 shadow-2xl backdrop-blur">
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Preferenze Cookie</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Usiamo cookie necessari sempre attivi e cookie opzionali (analytics/marketing) solo con tuo consenso.
              Puoi modificare in qualsiasi momento in Impostazioni o dalla Cookie Policy.
            </p>
          </div>

          {showCustomize ? (
            <div className="space-y-2 rounded-xl border border-border/60 bg-background/60 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-foreground">Necessari</p>
                  <p className="text-xs text-muted-foreground">Autenticazione e sicurezza (sempre attivi)</p>
                </div>
                <Switch checked disabled />
              </div>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-foreground">Funzionali</p>
                  <p className="text-xs text-muted-foreground">Preferenze interfaccia (tema, sidebar)</p>
                </div>
                <Switch checked={draft.functional} onCheckedChange={(value) => setDraft((prev) => ({ ...prev, functional: value }))} />
              </div>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-foreground">Analytics</p>
                  <p className="text-xs text-muted-foreground">Misure aggregate di utilizzo</p>
                </div>
                <Switch checked={draft.analytics} onCheckedChange={(value) => setDraft((prev) => ({ ...prev, analytics: value }))} />
              </div>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-foreground">Marketing</p>
                  <p className="text-xs text-muted-foreground">Comunicazioni promozionali opzionali</p>
                </div>
                <Switch checked={draft.marketing} onCheckedChange={(value) => setDraft((prev) => ({ ...prev, marketing: value }))} />
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="neon" size="sm" onClick={() => void persist({ functional: true, analytics: true, marketing: true })}>
              Accetta tutti
            </Button>
            <Button variant="outline-neon" size="sm" onClick={() => void persist({ functional: false, analytics: false, marketing: false })}>
              Rifiuta opzionali
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowCustomize((prev) => !prev)}>
              {showCustomize ? "Nascondi personalizzazione" : "Personalizza"}
            </Button>
            {showCustomize ? (
              <Button variant="outline-neon" size="sm" onClick={() => void persist(draft)}>
                Salva preferenze
              </Button>
            ) : null}
            <Button variant="ghost" size="sm" asChild>
              <Link href="/cookies">Cookie Policy</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
