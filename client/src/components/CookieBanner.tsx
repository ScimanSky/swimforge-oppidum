import { useEffect, useId, useMemo, useState } from "react";
import { toast } from "sonner";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/lib/trpc";
import { errorToastMessage } from "@/lib/trpc-errors";
import { useHoldCelebrations } from "@/hooks/useCelebrationGate";

const COOKIE_CONSENT_STORAGE_KEY = "swimforge:cookie-consent:v1";

type CookiePreferences = {
  necessary: true;
  functional: boolean;
  analytics: boolean;
  marketing: boolean;
  decidedAt: string;
};

type Choices = { functional: boolean; analytics: boolean; marketing: boolean };

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
  try {
    window.localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Storage unavailable (private mode, blocked): the choice lasts for this visit only.
  }
}

export function openCookiePreferencesPanel() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("swimforge:open-cookie-preferences"));
}

/** One optional category: its name and description label the switch. */
function CategoryRow({
  title,
  description,
  checked,
  disabled,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange?: (value: boolean) => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  return (
    <div className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <div>
        <p id={titleId} className="text-sm font-semibold">
          {title}
        </p>
        <p id={descriptionId} className="text-xs text-muted-foreground">
          {description}
        </p>
      </div>
      <Switch
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
      />
    </div>
  );
}

/**
 * First-visit cookie choice (and «Personalizza» later, via openCookiePreferencesPanel): stored on
 * this device and, when signed in, as the account's consents.
 */
export default function CookieBanner() {
  const meQuery = trpc.auth.me.useQuery(undefined, { retry: false });
  const consentBulkMutation = trpc.consent.setBulk.useMutation();
  const titleId = useId();

  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [showCustomize, setShowCustomize] = useState(false);
  const [draft, setDraft] = useState<Choices>({
    functional: true,
    analytics: false,
    marketing: false,
  });

  // New badges and records wait for the choice: a modal popup would swallow the taps on it.
  useHoldCelebrations("cookie-banner", !ready || open);

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
  const saving = consentBulkMutation.isPending;

  const persist = async (choices: Choices) => {
    const payload: CookiePreferences = {
      necessary: true,
      functional: choices.functional,
      analytics: choices.analytics,
      marketing: choices.marketing,
      decidedAt: new Date().toISOString(),
    };
    writeCookiePreferences(payload);

    if (canPersistServer) {
      try {
        await consentBulkMutation.mutateAsync({
          items: [
            { consentType: "cookie_analytics", granted: choices.analytics },
            { consentType: "marketing_communications", granted: choices.marketing },
          ],
        });
      } catch (error) {
        // Saved on this device; the banner stays open so the account's copy can be retried.
        toast.error(errorToastMessage(error, "Impossibile salvare le preferenze sul tuo account. Riprova."));
        return;
      }
    }

    setOpen(false);
    setShowCustomize(false);
  };

  if (!ready || !open) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[85] px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] md:px-6">
      <section
        aria-labelledby={titleId}
        className="mx-auto w-full max-w-4xl rounded-2xl border border-border bg-card p-4"
      >
        <h2 id={titleId} className="text-[15px] font-bold">
          Preferenze cookie
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Usiamo cookie necessari sempre attivi e cookie opzionali (analytics/marketing) solo con tuo consenso.
          Puoi modificare in qualsiasi momento in Impostazioni o dalla Cookie Policy.
        </p>

        {showCustomize ? (
          <div className="mt-3 divide-y divide-border rounded-xl bg-raised p-3">
            <CategoryRow title="Necessari" description="Autenticazione e sicurezza (sempre attivi)" checked disabled />
            <CategoryRow
              title="Funzionali"
              description="Preferenze interfaccia (tema, sidebar)"
              checked={draft.functional}
              onChange={(value) => setDraft((prev) => ({ ...prev, functional: value }))}
            />
            <CategoryRow
              title="Analytics"
              description="Misure aggregate di utilizzo"
              checked={draft.analytics}
              onChange={(value) => setDraft((prev) => ({ ...prev, analytics: value }))}
            />
            <CategoryRow
              title="Marketing"
              description="Comunicazioni promozionali opzionali"
              checked={draft.marketing}
              onChange={(value) => setDraft((prev) => ({ ...prev, marketing: value }))}
            />
          </div>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            disabled={saving}
            onClick={() => void persist({ functional: true, analytics: true, marketing: true })}
          >
            Accetta tutti
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={saving}
            onClick={() => void persist({ functional: false, analytics: false, marketing: false })}
          >
            Rifiuta opzionali
          </Button>
          {showCustomize ? (
            <Button variant="outline" size="sm" disabled={saving} onClick={() => void persist(draft)}>
              Salva preferenze
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            aria-expanded={showCustomize}
            onClick={() => setShowCustomize((prev) => !prev)}
          >
            {showCustomize ? "Nascondi personalizzazione" : "Personalizza"}
          </Button>
          <Link
            href="/cookies"
            className="inline-flex min-h-10 items-center px-2 text-sm font-semibold text-action-text hover:underline"
          >
            Cookie Policy
          </Link>
        </div>
      </section>
    </div>
  );
}
