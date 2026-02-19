import { cn } from "@/lib/utils";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Component, ReactNode } from "react";

const CHUNK_RELOAD_SESSION_KEY = "swimforge:chunk-reload-attempted";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    if (typeof window === "undefined") return;

    const message = `${error?.name ?? ""} ${error?.message ?? ""}`.toLowerCase();
    const isDynamicImportFailure =
      message.includes("failed to fetch dynamically imported module") ||
      message.includes("importing a module script failed") ||
      message.includes("chunkloaderror") ||
      message.includes("loading chunk");

    if (!isDynamicImportFailure) return;

    const hasReloaded = window.sessionStorage.getItem(CHUNK_RELOAD_SESSION_KEY) === "1";
    if (hasReloaded) return;

    window.sessionStorage.setItem(CHUNK_RELOAD_SESSION_KEY, "1");
    const url = new URL(window.location.href);
    url.searchParams.set("__chunk_reload", String(Date.now()));
    window.location.replace(url.toString());
  }

  render() {
    if (this.state.hasError) {
      const isProd = import.meta.env.PROD;
      return (
        <div className="flex items-center justify-center min-h-screen p-8 bg-background">
          <div className="flex flex-col items-center w-full max-w-2xl p-8">
            <AlertTriangle
              size={48}
              className="text-destructive mb-6 flex-shrink-0"
            />

            <h2 className="text-xl mb-4">Si è verificato un errore imprevisto.</h2>

            {isProd ? (
              <p className="mb-6 text-sm text-muted-foreground">
                Riprova tra qualche istante. Se il problema persiste, aggiorna la pagina.
              </p>
            ) : (
              <div className="p-4 w-full rounded bg-muted overflow-auto mb-6">
                <pre className="text-sm text-muted-foreground whitespace-break-spaces">
                  {this.state.error?.stack}
                </pre>
              </div>
            )}

            <button
              onClick={() => {
                if (typeof window !== "undefined") {
                  window.sessionStorage.removeItem(CHUNK_RELOAD_SESSION_KEY);
                }
                window.location.reload();
              }}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg",
                "bg-primary text-primary-foreground",
                "hover:opacity-90 cursor-pointer"
              )}
            >
              <RotateCcw size={16} />
              Ricarica pagina
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
