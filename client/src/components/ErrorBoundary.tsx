import { cn } from "@/lib/utils";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Component, ReactNode } from "react";

export const CHUNK_RELOAD_SESSION_KEY = "swimforge:chunk-reload-attempted";
/**
 * After this long without an error the page counts as loaded: the flag of the automatic reload
 * is cleared, so a tab left open reloads once again at the next deploy instead of showing the
 * error page.
 */
export const CHUNK_RELOAD_RESET_MS = 30_000;

/** sessionStorage can throw (storage blocked): the flag is then simply not kept. */
function readChunkReloadFlag(): boolean {
  try {
    return window.sessionStorage.getItem(CHUNK_RELOAD_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

/** False when the storage is blocked. */
function writeChunkReloadFlag(set: boolean): boolean {
  try {
    if (set) window.sessionStorage.setItem(CHUNK_RELOAD_SESSION_KEY, "1");
    else window.sessionStorage.removeItem(CHUNK_RELOAD_SESSION_KEY);
    return true;
  } catch {
    return false;
  }
}

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  private loadedTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidMount() {
    if (typeof window === "undefined") return;
    this.loadedTimer = setTimeout(() => {
      if (!this.state.hasError) writeChunkReloadFlag(false);
    }, CHUNK_RELOAD_RESET_MS);
  }

  componentWillUnmount() {
    clearTimeout(this.loadedTimer);
  }

  componentDidCatch(error: Error) {
    if (typeof window === "undefined") return;
    // Not loaded: the flag stays, so a chunk that keeps failing never reloads in a loop.
    clearTimeout(this.loadedTimer);

    const message = `${error?.name ?? ""} ${error?.message ?? ""}`.toLowerCase();
    const isDynamicImportFailure =
      message.includes("failed to fetch dynamically imported module") ||
      message.includes("importing a module script failed") ||
      message.includes("chunkloaderror") ||
      message.includes("loading chunk");

    if (!isDynamicImportFailure) return;

    // Without a stored flag (storage blocked) never reload: it could not stop at one.
    if (readChunkReloadFlag() || !writeChunkReloadFlag(true)) return;

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
                  writeChunkReloadFlag(false);
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
