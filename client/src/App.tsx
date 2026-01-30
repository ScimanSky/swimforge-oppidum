import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import Badges from "./pages/Badges";
import Challenges from "./pages/Challenges";
import ChallengeDetail from "./pages/ChallengeDetail";
import Leaderboard from "./pages/Leaderboard";
import Activities from "./pages/Activities";
import Profile from "./pages/Profile";
import Statistics from "./pages/Statistics";
import Coach from "./pages/Coach";
import CoachDryland from "./pages/CoachDryland";
import Community from "./pages/Community";
import Auth from "./pages/Auth";
import AuthCallback from "./pages/AuthCallback";
import StravaConnect from "./pages/StravaConnect";
import Settings from "./pages/Settings";
import BadgeUnlockNotification from "./components/BadgeUnlockNotification";
import { useBadgeNotifications } from "./hooks/useBadgeNotifications";
import AutoSync from "./components/AutoSync";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/auth" component={Auth} />
      <Route path="/auth/callback" component={AuthCallback} />
      <Route path="/strava/callback" component={StravaConnect} />
      <Route path="/login" component={Auth} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/badges" component={Badges} />
      <Route path="/challenges" component={Challenges} />
      <Route path="/challenges/:id" component={ChallengeDetail} />
      <Route path="/leaderboard" component={Leaderboard} />
      <Route path="/activities" component={Activities} />
      <Route path="/statistics" component={Statistics} />
      <Route path="/coach" component={Coach} />
      <Route path="/coach-dryland" component={CoachDryland} />
      <Route path="/community" component={Community} />
      <Route path="/profile" component={Profile} />
      <Route path="/settings" component={Settings} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const { pendingBadges, isShowing, clearBadges } = useBadgeNotifications();

  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster richColors position="top-center" />
          <AutoSync />
          <Router />
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
