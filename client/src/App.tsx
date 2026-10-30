import { lazy, Suspense, useEffect, type ComponentType } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Spinner } from "@/components/ui/spinner";
import { Redirect, Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import BadgeUnlockNotification from "./components/BadgeUnlockNotification";
import BadgeUnlockWatcher from "./components/BadgeUnlockWatcher";
import { useBadgeNotifications } from "./hooks/useBadgeNotifications";
import AutoSync from "./components/AutoSync";
import ActivityInsightNotification from "./components/ActivityInsightNotification";
import PbCelebrationNotification from "./components/PbCelebrationNotification";
import CookieBanner from "./components/CookieBanner";
import { hideSplash, initNativeRuntime } from "./lib/native-runtime";
import { PUBLIC_PATHS, type PublicPath } from "./lib/navigation";
import { isNativePlatform } from "./lib/platform";
import { registerPushToken } from "./lib/push";
import { getNativeSessionToken } from "./lib/session-token";
import { trpc } from "./lib/trpc";

// Lazy like every other page: public pages here, signed-in pages in ShellRoutes (which pulls in
// app-shell → supabase-js, kept out of the entry chunk).
const Home = lazy(() => import("./pages/Home"));
const AuthCallback = lazy(() => import("./pages/AuthCallback"));
const LegalAcceptance = lazy(() => import("./pages/LegalAcceptance"));
const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Privacy = lazy(() => import("./pages/Privacy"));
const Terms = lazy(() => import("./pages/Terms"));
const CookiePolicy = lazy(() => import("./pages/CookiePolicy"));
const OnboardingFlow = lazy(() => import("./components/onboarding/OnboardingFlow"));
const ShellRoutes = lazy(() => import("./components/app/ShellRoutes"));

const AuthRedirect = () => <Redirect to="/login" />;

/** One page per public path: typed on PUBLIC_PATHS so the two cannot drift apart. */
const PUBLIC_PAGES: Record<PublicPath, ComponentType> = {
  "/": Home,
  "/auth": AuthRedirect,
  "/auth/callback": AuthCallback,
  "/auth/consenso": LegalAcceptance,
  "/login": Login,
  "/register": Register,
  "/signup": Register,
  "/forgot-password": ForgotPassword,
  "/reset-password": ResetPassword,
  "/privacy": Privacy,
  "/terms": Terms,
  "/cookies": CookiePolicy,
};

/** Public routes; everything else goes to the persistent shell. */
export function AppRoutes() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen"><Spinner /></div>}>
    <Switch>
      {PUBLIC_PATHS.map((path) => {
        const Page = PUBLIC_PAGES[path];
        return (
          <Route key={path} path={path}>
            <Page />
          </Route>
        );
      })}
      <Route component={ShellRoutes} />
    </Switch>
    </Suspense>
  );
}

function ScrollToTop() {
  const [location] = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [location]);

  return null;
}

/** Native shell wiring (status bar, back button, deep links, push); renders nothing, no-op on the web. */
function NativeRuntime() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  useEffect(
    () =>
      initNativeRuntime({
        navigate,
        // Native Google sign-in returns here via swimforge://auth/callback (lib/native-auth.ts,
        // loaded lazily so supabase-js stays out of the entry chunk).
        onAuthCallback: async (callback) => {
          const { completeNativeAuthCallback } = await import("./lib/native-auth");
          return completeNativeAuthCallback(callback, {
            syncUser: (input) => utils.client.auth.syncSupabaseUser.mutate(input),
            onSignedIn: async (path) => {
              // Leave /login first (its "already authenticated" redirect would override the
              // onboarding path), then refetch everything with the new session.
              navigate(path, { replace: true });
              await utils.invalidate();
            },
          });
        },
      }),
    // navigate is stable in wouter's browser location hook; register the listeners once.
    [],
  );

  // Already signed in at start: (re)register for push (also picks up a refreshed FCM token
  // and the tap that cold-started the app). Fresh sign-ins register from syncSupabaseSession.
  useEffect(() => {
    if (isNativePlatform() && getNativeSessionToken()) void registerPushToken();
  }, []);

  return null;
}

function App() {
  const { pendingBadges, isShowing, clearBadges } = useBadgeNotifications();

  // The splash is configured with launchAutoHide: false; hide it once React has rendered.
  useEffect(() => {
    hideSplash();
  }, []);

  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark" switchable>
        <TooltipProvider>
          <Toaster richColors position="top-center" />
          <NativeRuntime />
          <AutoSync />
          <BadgeUnlockWatcher />
          <ScrollToTop />
          <AppRoutes />
          <ActivityInsightNotification />
          <PbCelebrationNotification />
          <CookieBanner />
          <Suspense fallback={null}>
            <OnboardingFlow />
          </Suspense>
          {isShowing && pendingBadges.length > 0 && (
            <BadgeUnlockNotification
              badges={pendingBadges}
              onComplete={clearBadges}
            />
          )}
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
