import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import App from "./App";
import { getLoginUrl } from "./const";
import { endExpiredSession } from "@/lib/session-expired";
import { loadNativeSessionToken } from "@/lib/session-token";
import { createTrpcLinks } from "@/lib/trpc-client";
import "@fontsource/manrope/latin-400.css";
import "@fontsource/manrope/latin-500.css";
import "@fontsource/manrope/latin-600.css";
import "@fontsource/manrope/latin-700.css";
import "@fontsource/barlow-condensed/latin-600.css";
import "@fontsource/barlow-condensed/latin-700.css";
import "./index.css";

const queryClient = new QueryClient();

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;

  // Device-side push cleanup first (awaited, max 1 s), then token clear and redirect.
  void endExpiredSession(() => {
    window.location.href = getLoginUrl();
  });
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

const trpcClient = trpc.createClient({ links: createTrpcLinks() });

const render = () =>
  createRoot(document.getElementById("root")!).render(
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </trpc.Provider>
  );

// Native: the session token lives in Preferences (async); load it into the in-memory cache
// before the first query runs. Resolves immediately on the web. Capped at 3 s so a stuck
// bridge never leaves the app blank (worst case: signed out until the next start).
const NATIVE_TOKEN_LOAD_TIMEOUT_MS = 3000;
void Promise.race([
  loadNativeSessionToken(),
  new Promise<void>((resolve) => setTimeout(resolve, NATIVE_TOKEN_LOAD_TIMEOUT_MS)),
])
  .catch(() => {})
  .finally(render);
