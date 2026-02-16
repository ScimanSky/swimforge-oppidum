import { lazy, Suspense, useEffect } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Spinner } from "@/components/ui/spinner";
import NotFound from "@/pages/NotFound";
import { Redirect, Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import BadgeUnlockNotification from "./components/BadgeUnlockNotification";
import BadgeUnlockWatcher from "./components/BadgeUnlockWatcher";
import SeasonLaunchPopup from "./components/SeasonLaunchPopup";
import { useBadgeNotifications } from "./hooks/useBadgeNotifications";
import AutoSync from "./components/AutoSync";
import ActivityInsightNotification from "./components/ActivityInsightNotification";

const Home = lazy(() => import("./pages/Home"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Badges = lazy(() => import("./pages/Badges"));
const Challenges = lazy(() => import("./pages/Challenges"));
const ChallengeDetail = lazy(() => import("./pages/ChallengeDetail"));
const Leaderboard = lazy(() => import("./pages/Leaderboard"));
const Activities = lazy(() => import("./pages/Activities"));
const ActivityDetail = lazy(() => import("./pages/ActivityDetail"));
const Goals = lazy(() => import("./pages/Goals"));
const Profile = lazy(() => import("./pages/Profile"));
const PublicProfile = lazy(() => import("./pages/PublicProfile"));
const Statistics = lazy(() => import("./pages/Statistics"));
const Coach = lazy(() => import("./pages/Coach"));
const SeasonPage = lazy(() => import("./pages/Season"));
const SocialFeed = lazy(() => import("./pages/SocialFeed"));
const ReportPost = lazy(() => import("./pages/ReportPost"));
const Community = lazy(() => import("./pages/Community"));
const ClubInvite = lazy(() => import("./pages/ClubInvite"));
const ClubDetail = lazy(() => import("./pages/ClubDetailEnhanced"));
const ClubEventDetail = lazy(() => import("./pages/ClubEventDetail"));
const AdminReports = lazy(() => import("./pages/AdminReports"));
const Auth = lazy(() => import("./pages/Auth"));
const AuthCallback = lazy(() => import("./pages/AuthCallback"));
const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const StravaConnect = lazy(() => import("./pages/StravaConnect"));
const Settings = lazy(() => import("./pages/Settings"));
const Privacy = lazy(() => import("./pages/Privacy"));
const Terms = lazy(() => import("./pages/Terms"));

function Router() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen"><Spinner /></div>}>
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
      <Route path="/home" component={SocialFeed} />
      <Route path="/home/report/post/:postId" component={ReportPost} />
      <Route path="/dashboard">
        <Redirect to="/home" />
      </Route>
      <Route path="/report/post/:postId">{(params: { postId: string }) => <Redirect to={`/home/report/post/${params.postId}`} />}</Route>
      <Route path="/admin/reports" component={AdminReports} />
      <Route path="/home/admin/reports">
        <Redirect to="/admin/reports" />
      </Route>
      <Route path="/home/dashboard" component={Dashboard} />
      <Route path="/badges" component={Badges} />
      <Route path="/season/challenges" component={Challenges} />
      <Route path="/challenges">
        <Redirect to="/season/challenges" />
      </Route>
      <Route path="/season/challenges/:id" component={ChallengeDetail} />
      <Route path="/challenges/:id">{(params: { id: string }) => <Redirect to={`/season/challenges/${params.id}`} />}</Route>
      <Route path="/season/leaderboard" component={Leaderboard} />
      <Route path="/leaderboard">
        <Redirect to="/season/leaderboard" />
      </Route>
      <Route path="/track/:id" component={ActivityDetail} />
      <Route path="/activities/:id">{(params: { id: string }) => <Redirect to={`/track/${params.id}`} />}</Route>
      <Route path="/track" component={Activities} />
      <Route path="/activities">
        <Redirect to="/track" />
      </Route>
      <Route path="/season/objectives" component={Goals} />
      <Route path="/goals">
        <Redirect to="/season/objectives" />
      </Route>
      <Route path="/profile/performance" component={Statistics} />
      <Route path="/statistics">
        <Redirect to="/profile/performance" />
      </Route>
      <Route path="/coach" component={Coach} />
      <Route path="/coach-dryland">
        <Redirect to="/coach?tab=workouts&workout=dryland" />
      </Route>
      <Route path="/session-iq">
        <Redirect to="/coach?tab=session-iq" />
      </Route>
      <Route path="/season" component={SeasonPage} />
      <Route path="/community/invite/:code" component={ClubInvite} />
      <Route path="/community/club/:clubId/event/:eventId" component={ClubEventDetail} />
      <Route path="/community/club/:id" component={ClubDetail} />
      <Route path="/home/community" component={Community} />
      <Route path="/community">
        <Redirect to="/home/community" />
      </Route>
      <Route path="/profile" component={Profile} />
      <Route path="/u/:id" component={PublicProfile} />
      <Route path="/settings" component={Settings} />
      <Route path="/privacy" component={Privacy} />
      <Route path="/terms" component={Terms} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
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

function App() {
  const { pendingBadges, isShowing, clearBadges } = useBadgeNotifications();

  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark" switchable>
        <TooltipProvider>
          <Toaster richColors position="top-center" />
          <AutoSync />
          <BadgeUnlockWatcher />
          <SeasonLaunchPopup />
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
