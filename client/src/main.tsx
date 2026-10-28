import { trpc } from "@/lib/trpc";
import { CSRF_COOKIE_NAME, UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { getLoginUrl } from "./const";
import { apiUrl } from "@/lib/api-base";
import { isNativePlatform } from "@/lib/platform";
import { clearNativeSessionToken, getNativeSessionToken, loadNativeSessionToken } from "@/lib/session-token";
import { buildTrpcHeaders } from "@/lib/trpc-headers";
import "./index.css";

const queryClient = new QueryClient();

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;

  clearNativeSessionToken();
  window.location.href = getLoginUrl();
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

const readCsrfCookie = (): string | null =>
  typeof document === "undefined"
    ? null
    : document.cookie
        .split(";")
        .map((entry) => entry.trim())
        .find((entry) => entry.startsWith(`${CSRF_COOKIE_NAME}=`))
        ?.slice(CSRF_COOKIE_NAME.length + 1) ?? null;

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: apiUrl("/api/trpc"),
      transformer: superjson,
      fetch(input, init) {
        const headers = buildTrpcHeaders(
          { isNative: isNativePlatform(), csrfToken: readCsrfCookie(), nativeToken: getNativeSessionToken() },
          init?.headers,
        );
        return globalThis.fetch(input, {
          ...(init ?? {}),
          headers,
          credentials: "include",
        });
      },
    }),
  ],
});

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
