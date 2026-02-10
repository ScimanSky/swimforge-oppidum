import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import Badges from "./pages/Badges";
import Challenges from "./pages/Challenges";
import ChallengeDetail from "./pages/ChallengeDetail";
import Leaderboard from "./pages/Leaderboard";
import Activities from "./pages/Activities";
import ActivityDetail from "./pages/ActivityDetail";
import Goals from "./pages/Goals";
import Profile from "./pages/Profile";
import PublicProfile from "./pages/PublicProfile";
import Statistics from "./pages/Statistics";
import Coach from "./pages/Coach";
import CoachDryland from "./pages/CoachDryland";
import SessionInsights from "./pages/SessionInsights";
import Community from "./pages/Community";
import ClubInvite from "./pages/ClubInvite";
import ClubDetail from "./pages/ClubDetail";
import ClubEventDetail from "./pages/ClubEventDetail";
import Auth from "./pages/Auth";
import AuthCallback from "./pages/AuthCallback";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import StravaConnect from "./pages/StravaConnect";
import Settings from "./pages/Settings";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";
import BadgeUnlockNotification from "./components/BadgeUnlockNotification";
import { useBadgeNotifications } from "./hooks/useBadgeNotifications";
import AutoSync from "./components/AutoSync";
import ActivityInsightNotification from "./components/ActivityInsightNotification";
import { useEffect } from "react";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/auth" component={Auth} />
      <Route path="/auth/callback" component={AuthCallback} />
      <Route path="/strava/callback" component={StravaConnect} />
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/signup" component={Register} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/badges" component={Badges} />
      <Route path="/challenges" component={Challenges} />
      <Route path="/challenges/:id" component={ChallengeDetail} />
      <Route path="/leaderboard" component={Leaderboard} />
      <Route path="/activities/:id" component={ActivityDetail} />
      <Route path="/activities" component={Activities} />
      <Route path="/goals" component={Goals} />
      <Route path="/statistics" component={Statistics} />
      <Route path="/coach" component={Coach} />
      <Route path="/coach-dryland" component={CoachDryland} />
      <Route path="/session-iq" component={SessionInsights} />
      <Route path="/community" component={Community} />
      <Route path="/community/invite/:code" component={ClubInvite} />
      <Route path="/community/club/:clubId/event/:eventId" component={ClubEventDetail} />
      <Route path="/community/club/:id" component={ClubDetail} />
      <Route path="/profile" component={Profile} />
      <Route path="/u/:id" component={PublicProfile} />
      <Route path="/settings" component={Settings} />
      <Route path="/privacy" component={Privacy} />
      <Route path="/terms" component={Terms} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function ScrollToTop() {
  const [location] = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [location]);

  return null;
}

function App() {
  const { pendingBadges, isShowing, clearBadges } = useBadgeNotifications();

  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light" switchable>
        <TooltipProvider>
          <Toaster richColors position="top-center" />
          <AutoSync />
          <ScrollToTop />
          <Router />
          <ActivityInsightNotification />
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
