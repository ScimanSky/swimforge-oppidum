import { lazy } from "react";
import { Redirect, Route, Switch } from "wouter";
import { AppShell } from "./app-shell";
import { UI_FEATURE_FLAGS } from "@/lib/feature-flags";

// Each page stays its own chunk; this module (shell + supabase-js) is lazy in App.tsx.
const Today = lazy(() => import("@/pages/Today"));
const Badges = lazy(() => import("@/pages/Badges"));
const Challenges = lazy(() => import("@/pages/Challenges"));
const ChallengeDetail = lazy(() => import("@/pages/ChallengeDetail"));
const Leaderboard = lazy(() => import("@/pages/Leaderboard"));
const Activities = lazy(() => import("@/pages/Activities"));
const ActivityDetail = lazy(() => import("@/pages/ActivityDetail"));
const Goals = lazy(() => import("@/pages/Goals"));
const Profile = lazy(() => import("@/pages/Profile"));
const PublicProfile = lazy(() => import("@/pages/PublicProfile"));
const Statistics = lazy(() => import("@/pages/Statistics"));
const Coach = lazy(() => import("@/pages/Coach"));
const SocialFeed = lazy(() => import("@/pages/SocialFeed"));
const Messages = lazy(() => import("@/pages/Messages"));
const PostDetail = lazy(() => import("@/pages/PostDetail"));
const ReportPost = lazy(() => import("@/pages/ReportPost"));
const Community = lazy(() => import("@/pages/Community"));
const ClubInvite = lazy(() => import("@/pages/ClubInvite"));
const ClubDetail = lazy(() => import("@/pages/ClubDetailEnhanced"));
const ClubCoachModeration = lazy(() => import("@/pages/ClubCoachModeration"));
const ClubDocumentsPage = lazy(() => import("@/pages/ClubDocumentsPage"));
const ClubEventDetail = lazy(() => import("@/pages/ClubEventDetail"));
const ClubMeetDetail = lazy(() => import("@/pages/ClubMeetDetail"));
const ClubMeetProgramBuilder = lazy(() => import("@/pages/ClubMeetProgramBuilder"));
const ClubHistoryAthletesPage = lazy(() => import("@/pages/ClubHistoryAthletesPage"));
const ClubHistoryMeetsPage = lazy(() => import("@/pages/ClubHistoryMeetsPage"));
const ClubWorkoutsPage = lazy(() => import("@/pages/ClubWorkoutsPage"));
const ClubWorkoutDetailPage = lazy(() => import("@/pages/ClubWorkoutDetailPage"));
const ClubPbLeaderboardPage = lazy(() => import("@/pages/ClubPbLeaderboardPage"));
const AdminReports = lazy(() => import("@/pages/AdminReports"));
const Settings = lazy(() => import("@/pages/Settings"));
const NotFound = lazy(() => import("@/pages/NotFound"));

/**
 * Every signed-in page under one persistent AppShell: header and navigation stay mounted
 * across routes, pages load in the shell's own Suspense. Unknown paths render NotFound here.
 */
export default function ShellRoutes() {
  const clubMeetsV1Enabled = UI_FEATURE_FLAGS.clubMeetsV1;
  const clubHistoryV1Enabled = UI_FEATURE_FLAGS.clubHistoryV1;

  return (
    <AppShell>
      <Switch>
        <Route path="/today" component={Today} />
        <Route path="/home" component={SocialFeed} />
        <Route path="/messages" component={Messages} />
        <Route path="/home/messages">
          <Redirect to="/messages" />
        </Route>
        <Route path="/post/:postId" component={PostDetail} />
        <Route path="/home/post/:postId">{(params: { postId: string }) => <Redirect to={`/post/${params.postId}`} />}</Route>
        <Route path="/home/report/post/:postId" component={ReportPost} />
        <Route path="/dashboard">
          <Redirect to="/track" />
        </Route>
        <Route path="/report/post/:postId">{(params: { postId: string }) => <Redirect to={`/home/report/post/${params.postId}`} />}</Route>
        <Route path="/admin/reports" component={AdminReports} />
        <Route path="/home/admin/reports">
          <Redirect to="/admin/reports" />
        </Route>
        <Route path="/home/dashboard">
          <Redirect to="/track" />
        </Route>
        <Route path="/badges" component={Badges} />
        <Route path="/challenges" component={Challenges} />
        <Route path="/season/challenges">
          <Redirect to="/challenges" />
        </Route>
        <Route path="/challenges/:id" component={ChallengeDetail} />
        <Route path="/season/challenges/:id">{(params: { id: string }) => <Redirect to={`/challenges/${params.id}`} />}</Route>
        <Route path="/leaderboard" component={Leaderboard} />
        <Route path="/season/leaderboard">
          <Redirect to="/leaderboard" />
        </Route>
        <Route path="/track/:id" component={ActivityDetail} />
        <Route path="/activities/:id">{(params: { id: string }) => <Redirect to={`/track/${params.id}`} />}</Route>
        <Route path="/track" component={Activities} />
        <Route path="/activities">
          <Redirect to="/track" />
        </Route>
        <Route path="/goals" component={Goals} />
        <Route path="/season/objectives">
          <Redirect to="/goals" />
        </Route>
        <Route path="/season">
          <Redirect to="/track" />
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
        <Route path="/community/invite/:code" component={ClubInvite} />
        <Route path="/community/club/:clubId/event/:eventId" component={ClubEventDetail} />
        {clubMeetsV1Enabled ? (
          <Route path="/community/club/:clubId/meet/:meetId/program" component={ClubMeetProgramBuilder} />
        ) : null}
        {clubMeetsV1Enabled ? (
          <Route path="/community/club/:clubId/meet/:meetId" component={ClubMeetDetail} />
        ) : null}
        {clubHistoryV1Enabled ? (
          <Route path="/community/club/:clubId/history/athletes" component={ClubHistoryAthletesPage} />
        ) : null}
        {clubHistoryV1Enabled ? (
          <Route path="/community/club/:clubId/history/meets" component={ClubHistoryMeetsPage} />
        ) : null}
        <Route path="/community/club/:clubId/workouts/:workoutId" component={ClubWorkoutDetailPage} />
        <Route path="/community/club/:clubId/workouts" component={ClubWorkoutsPage} />
        <Route path="/community/club/:clubId/pb" component={ClubPbLeaderboardPage} />
        <Route path="/community/club/:clubId/documents" component={ClubDocumentsPage} />
        <Route path="/community/club/:id/coach" component={ClubCoachModeration} />
        <Route path="/community/club/:id" component={ClubDetail} />
        <Route path="/home/community" component={Community} />
        <Route path="/community">
          <Redirect to="/home/community" />
        </Route>
        <Route path="/profile" component={Profile} />
        <Route path="/u/:id" component={PublicProfile} />
        <Route path="/settings" component={Settings} />
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </AppShell>
  );
}
