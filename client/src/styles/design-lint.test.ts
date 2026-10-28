import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Not new URL(.., import.meta.url): under vitest/jsdom Vite rewrites it into an asset URL.
const SRC = path.resolve(import.meta.dirname, "..");

function sourceFiles(dir = SRC): string[] {
  return readdirSync(dir).flatMap(name => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    if (!/\.(tsx|ts|css)$/.test(name) || /\.test\.tsx?$/.test(name)) return [];
    return [path.relative(SRC, full).split(path.sep).join("/")];
  });
}

const RULES = {
  "testo-piccolo": /text-\[(?:[5-9]|10|11)px\]|text-\[0\.[5-6]\d*rem\]/,
  "alone-neon": /neon-glow|neon-soft|forge-glow|shadow-\[0_0_/,
  "maiuscolo-spaziato":
    /\buppercase\b[^"'`\n]*\btracking-(?:\[[^\]]+\]|wide|wider|widest)|\btracking-(?:\[[^\]]+\]|wide|wider|widest)[^"'`\n]*\buppercase\b/,
  "testo-gradiente": /neon-gradient-text|bg-clip-text/,
  "token-legacy": /electric-(?:cyan|lime|coral|violet)|forge-orange/,
  "variante-neon": /variant=["'](?:neon|outline-neon|ghost-neon)["']/,
  "testo-primario": /(?<![\w-])text-primary(?![\w-])/,
  "accento-lime": /(?<![\w-])(?:text|border|ring|from|to|via)-accent(?![\w-])/,
  gradiente:
    /bg-gradient-to-|bg-(?:linear|radial|conic)-|(?:linear|radial|conic)-gradient\(/,
  sfocatura: /backdrop-blur|backdrop-filter/,
} as const;
type Rule = keyof typeof RULES;

/** Files allowed to match a rule for good (justify each entry). */
const EXEMPT: Partial<Record<Rule, readonly string[]>> = {
  gradiente: ["index.css"], // skeleton shimmer animation
};

/**
 * Files still to clean, per rule. Ratchet: a file leaves the list in the task that cleans it
 * and can never come back; at the end of phase 2 every list is empty.
 * `index.css` (alone-neon, token-legacy) is the legacy alias block: it stays until Task 22.
 */
const PENDING: Record<Rule, string[]> = {
  "testo-piccolo": [
    "components/DirectMessages.tsx",
    "components/app/app-shell.tsx",
    "components/club/ClubDocumentsPanel.tsx",
    "components/club/ClubFeedTab.tsx",
    "components/club/ClubHero.tsx",
    "components/club/HistoryMetricCircle.tsx",
    "components/metrics/MetricOrb.tsx",
    "components/social/CreatePostSheet.tsx",
    "components/social/FeedPost.tsx",
    "components/social/FeedPostComments.tsx",
    "components/social/FeedPostHeader.tsx",
    "components/social/FeedPostMetrics.tsx",
    "components/social/FeedSidebar.tsx",
    "components/social/FollowStarterCard.tsx",
    "components/social/ForwardContentDialog.tsx",
    "components/social/ShareActivityPicker.tsx",
    "components/social/UploadStatusPill.tsx",
    "lib/social-content.tsx",
    "pages/Activities.tsx",
    "pages/ActivityDetail.tsx",
    "pages/ChallengeDetail.tsx",
    "pages/ClubCoachModeration.tsx",
    "pages/ClubDetailEnhanced.tsx",
    "pages/ClubHistoryAthletesPage.tsx",
    "pages/ClubHistoryMeetsPage.tsx",
    "pages/ClubPbLeaderboardPage.tsx",
    "pages/Coach.tsx",
    "pages/Home.tsx",
    "pages/Leaderboard.tsx",
    "pages/Profile.tsx",
    "pages/PublicProfile.tsx",
    "pages/Statistics.tsx",
  ],
  "alone-neon": [
    "components/club/ClubHero.tsx",
    "components/club/HistoryMetricCircle.tsx",
    "components/onboarding/OnboardingFlow.tsx",
    "components/social/FeedPostMetrics.tsx",
    "index.css",
    "pages/Activities.tsx",
    "pages/ClubHistoryAthletesPage.tsx",
    "pages/ClubHistoryMeetsPage.tsx",
    "pages/Login.tsx",
    "pages/Register.tsx",
  ],
  "maiuscolo-spaziato": [
    "components/ActivityInsightNotification.tsx",
    "components/DirectMessages.tsx",
    "components/PbCelebrationNotification.tsx",
    "components/app/app-shell.tsx",
    "components/club/ClubDocumentsPanel.tsx",
    "components/club/ClubEventsPanel.tsx",
    "components/club/HistoryMetricCircle.tsx",
    "components/club/PulseBar.tsx",
    "components/metrics/MetricOrb.tsx",
    "components/onboarding/OnboardingFlow.tsx",
    "components/onboarding/OnboardingIdentitySetup.tsx",
    "components/social/FeedPostMetrics.tsx",
    "components/social/ForwardContentDialog.tsx",
    "pages/Activities.tsx",
    "pages/ActivityDetail.tsx",
    "pages/ClubCoachModeration.tsx",
    "pages/ClubDetailEnhanced.tsx",
    "pages/ClubHistoryAthletesPage.tsx",
    "pages/ClubHistoryMeetsPage.tsx",
    "pages/ClubMeetDetail.tsx",
    "pages/ClubMeetProgramBuilder.tsx",
    "pages/ClubPbLeaderboardPage.tsx",
    "pages/ClubWorkoutsPage.tsx",
    "pages/Coach.tsx",
    "pages/Home.tsx",
    "pages/Statistics.tsx",
  ],
  "testo-gradiente": [
    "components/BadgeUnlockNotification.tsx",
    "components/metrics/MetricOrb.tsx",
    "pages/Activities.tsx",
    "pages/ActivityDetail.tsx",
    "pages/ChallengeDetail.tsx",
    "pages/Challenges.tsx",
    "pages/ClubEventDetail.tsx",
    "pages/Coach.tsx",
    "pages/Community.tsx",
    "pages/Messages.tsx",
    "pages/Profile.tsx",
    "pages/PublicProfile.tsx",
    "pages/Settings.tsx",
  ],
  "token-legacy": [
    "components/DirectMessages.tsx",
    "components/app/app-shell.tsx",
    "components/club/ClubFeedTab.tsx",
    "components/club/ClubHero.tsx",
    "components/club/PulseBar.tsx",
    "components/metrics/MetricOrb.tsx",
    "components/onboarding/OnboardingFlow.tsx",
    "components/onboarding/OnboardingIdentitySetup.tsx",
    "components/social/CreatePostSheet.tsx",
    "components/social/FeedPost.tsx",
    "components/social/FeedPostActions.tsx",
    "components/social/FeedPostComments.tsx",
    "components/social/FeedPostHeader.tsx",
    "components/social/FeedPostMetrics.tsx",
    "components/social/FeedSidebar.tsx",
    "components/social/FeedSubTabs.tsx",
    "components/social/ShareActivityPicker.tsx",
    "components/social/UploadStatusPill.tsx",
    "index.css",
    "lib/social-content.tsx",
    "pages/Activities.tsx",
    "pages/ActivityDetail.tsx",
    "pages/Badges.tsx",
    "pages/Challenges.tsx",
    "pages/ClubDetailEnhanced.tsx",
    "pages/ClubHistoryAthletesPage.tsx",
    "pages/ClubHistoryMeetsPage.tsx",
    "pages/Community.tsx",
    "pages/ReportPost.tsx",
    "pages/SocialFeed.tsx",
  ],
  "variante-neon": [
    "components/CookieBanner.tsx",
    "components/DirectMessages.tsx",
    "components/PbCelebrationNotification.tsx",
    "components/club/ClubDocumentsPanel.tsx",
    "components/club/ClubFeedTab.tsx",
    "components/club/ClubHero.tsx",
    "components/club/ClubMembersTab.tsx",
    "components/club/EventMapEditor.tsx",
    "components/club/QuickActionsFAB.tsx",
    "components/onboarding/OnboardingFirstAction.tsx",
    "components/onboarding/OnboardingFlow.tsx",
    "components/onboarding/OnboardingIdentitySetup.tsx",
    "components/social/CreatePostSheet.tsx",
    "components/social/FeedSidebar.tsx",
    "components/social/FollowStarterCard.tsx",
    "components/social/ForwardContentDialog.tsx",
    "components/social/ShareActivityPicker.tsx",
    "pages/Activities.tsx",
    "pages/ActivityDetail.tsx",
    "pages/AdminReports.tsx",
    "pages/Badges.tsx",
    "pages/ChallengeDetail.tsx",
    "pages/Challenges.tsx",
    "pages/ClubCoachModeration.tsx",
    "pages/ClubDetailEnhanced.tsx",
    "pages/ClubDocumentsPage.tsx",
    "pages/ClubEventDetail.tsx",
    "pages/ClubHistoryAthletesPage.tsx",
    "pages/ClubHistoryMeetsPage.tsx",
    "pages/ClubMeetDetail.tsx",
    "pages/ClubMeetProgramBuilder.tsx",
    "pages/ClubPbLeaderboardPage.tsx",
    "pages/ClubWorkoutDetailPage.tsx",
    "pages/ClubWorkoutsPage.tsx",
    "pages/Coach.tsx",
    "pages/Community.tsx",
    "pages/ForgotPassword.tsx",
    "pages/Goals.tsx",
    "pages/Leaderboard.tsx",
    "pages/Login.tsx",
    "pages/PostDetail.tsx",
    "pages/Profile.tsx",
    "pages/PublicProfile.tsx",
    "pages/Register.tsx",
    "pages/ReportPost.tsx",
    "pages/ResetPassword.tsx",
    "pages/Settings.tsx",
    "pages/SocialFeed.tsx",
  ],
  "testo-primario": [],
  "accento-lime": [
    "pages/Coach.tsx",
    "pages/PublicProfile.tsx",
  ],
  gradiente: [
    "components/ActivityInsightNotification.tsx",
    "components/BadgeUnlockNotification.tsx",
    "components/DirectMessages.tsx",
    "components/PbCelebrationNotification.tsx",
    "components/app/app-shell.tsx",
    "components/club/ClubFeedTab.tsx",
    "components/club/ClubHero.tsx",
    "components/club/HistoryMetricCircle.tsx",
    "components/metrics/MetricOrb.tsx",
    "components/onboarding/OnboardingWelcomeComposition.tsx",
    "components/social/FeedPost.tsx",
    "components/social/FeedSidebar.tsx",
    "components/social/FeedSubTabs.tsx",
    "pages/Activities.tsx",
    "pages/ActivityDetail.tsx",
    "pages/AuthCallback.tsx",
    "pages/Badges.tsx",
    "pages/Challenges.tsx",
    "pages/ClubHistoryAthletesPage.tsx",
    "pages/ClubHistoryMeetsPage.tsx",
    "pages/Coach.tsx",
    "pages/Community.tsx",
    "pages/ForgotPassword.tsx",
    "pages/Home.tsx",
    "pages/Leaderboard.tsx",
    "pages/Login.tsx",
    "pages/NotFound.tsx",
    "pages/Profile.tsx",
    "pages/PublicProfile.tsx",
    "pages/Register.tsx",
    "pages/ResetPassword.tsx",
    "pages/Settings.tsx",
    "pages/SocialFeed.tsx",
  ],
  sfocatura: [
    "components/ActivityInsightNotification.tsx",
    "components/BadgeUnlockNotification.tsx",
    "components/CookieBanner.tsx",
    "components/PbCelebrationNotification.tsx",
    "components/app/app-shell.tsx",
    "components/club/HistoryMetricCircle.tsx",
    "components/metrics/MetricOrb.tsx",
    "components/social/FeedPost.tsx",
    "components/social/FeedPostMetrics.tsx",
    "pages/Badges.tsx",
    "pages/ClubEventDetail.tsx",
    "pages/ClubInvite.tsx",
    "pages/Home.tsx",
    "pages/NotFound.tsx",
    "pages/StravaConnect.tsx",
  ],
};

const contents = new Map(
  sourceFiles().map(file => [file, readFileSync(path.join(SRC, file), "utf8")])
);
const offenders = (rule: Rule) =>
  [...contents]
    .filter(
      ([file, text]) => RULES[rule].test(text) && !EXEMPT[rule]?.includes(file)
    )
    .map(([file]) => file)
    .sort();

describe("design-lint Corsia", () => {
  for (const rule of Object.keys(RULES) as Rule[]) {
    it(`${rule}: nessun file fuori elenco`, () => {
      expect(
        offenders(rule).filter(file => !PENDING[rule].includes(file))
      ).toEqual([]);
    });
    it(`${rule}: elenco aggiornato (togliere i file ripuliti)`, () => {
      const current = offenders(rule);
      expect(PENDING[rule].filter(file => !current.includes(file))).toEqual(
        []
      );
    });
  }
});
