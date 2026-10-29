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
  // Under 12px, also decimal px and rem (0.75rem = 12px stays allowed).
  "testo-piccolo":
    /text-\[(?:[5-9]|10|11)(?:\.\d+)?px\]|text-\[0\.(?:[5-6]\d*|7[0-4]\d*|7)rem\]/,
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
  // Pages inside the shell have no h1: the page title is the h1 in the shell header.
  "titolo-pagina": /<h1[\s>]/,
  // Fixed colours in classes: photo veils and text on destructive use tokens instead.
  "colore-fisso":
    /-\[(?:#|rgba?\(|hsla?\(|oklch\()|(?<![\w-])(?:text-white|bg-white|bg-black)(?![\w-])/,
} as const;
type Rule = keyof typeof RULES;

/** Files allowed to match a rule for good (justify each entry). */
const EXEMPT: Partial<Record<Rule, readonly string[]>> = {
  gradiente: ["index.css"], // skeleton shimmer animation
  // The shell header owns the page title; Home and StravaConnect are public pages outside the shell.
  "titolo-pagina": [
    "components/app/ShellHeader.tsx",
    "pages/Home.tsx",
    "pages/StravaConnect.tsx",
  ],
};

/**
 * Files still to clean, per rule. Ratchet: a file leaves the list in the task that cleans it
 * and can never come back; at the end of phase 2 every list is empty.
 * `index.css` (alone-neon, token-legacy) is the legacy alias block: it stays until Task 22.
 */
const PENDING: Record<Rule, string[]> = {
  "testo-piccolo": [
    "components/DirectMessages.tsx",
    "components/club/ClubDocumentsPanel.tsx",
    "components/club/ClubFeedTab.tsx",
    "components/club/ClubHero.tsx",
    "components/club/HistoryMetricCircle.tsx",
    "components/metrics/MetricOrb.tsx",
    "lib/social-content.tsx",
    "pages/ChallengeDetail.tsx",
    "pages/ClubCoachModeration.tsx",
    "pages/ClubDetailEnhanced.tsx",
    "pages/ClubHistoryAthletesPage.tsx",
    "pages/ClubHistoryMeetsPage.tsx",
    "pages/ClubPbLeaderboardPage.tsx",
    "pages/Home.tsx",
  ],
  "alone-neon": [
    "components/club/ClubHero.tsx",
    "components/club/HistoryMetricCircle.tsx",
    "components/onboarding/OnboardingFlow.tsx",
    "index.css",
    "pages/ClubHistoryAthletesPage.tsx",
    "pages/ClubHistoryMeetsPage.tsx",
    "pages/Login.tsx",
    "pages/Register.tsx",
  ],
  "maiuscolo-spaziato": [
    "components/ActivityInsightNotification.tsx",
    "components/DirectMessages.tsx",
    "components/PbCelebrationNotification.tsx",
    "components/club/ClubDocumentsPanel.tsx",
    "components/club/ClubEventsPanel.tsx",
    "components/club/HistoryMetricCircle.tsx",
    "components/club/PulseBar.tsx",
    "components/metrics/MetricOrb.tsx",
    "components/onboarding/OnboardingFlow.tsx",
    "components/onboarding/OnboardingIdentitySetup.tsx",
    "pages/ClubCoachModeration.tsx",
    "pages/ClubDetailEnhanced.tsx",
    "pages/ClubHistoryAthletesPage.tsx",
    "pages/ClubHistoryMeetsPage.tsx",
    "pages/ClubMeetDetail.tsx",
    "pages/ClubMeetProgramBuilder.tsx",
    "pages/ClubPbLeaderboardPage.tsx",
    "pages/ClubWorkoutsPage.tsx",
    "pages/Home.tsx",
  ],
  "testo-gradiente": [
    "components/BadgeUnlockNotification.tsx",
    "components/metrics/MetricOrb.tsx",
    "pages/ChallengeDetail.tsx",
    "pages/Challenges.tsx",
    "pages/ClubEventDetail.tsx",
    "pages/Messages.tsx",
    "pages/PublicProfile.tsx",
    "pages/Settings.tsx",
  ],
  "token-legacy": [
    "components/DirectMessages.tsx",
    "components/club/ClubFeedTab.tsx",
    "components/club/ClubHero.tsx",
    "components/club/PulseBar.tsx",
    "components/metrics/MetricOrb.tsx",
    "components/onboarding/OnboardingFlow.tsx",
    "components/onboarding/OnboardingIdentitySetup.tsx",
    "index.css",
    "lib/social-content.tsx",
    "pages/Badges.tsx",
    "pages/Challenges.tsx",
    "pages/ClubDetailEnhanced.tsx",
    "pages/ClubHistoryAthletesPage.tsx",
    "pages/ClubHistoryMeetsPage.tsx",
    "pages/ReportPost.tsx",
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
    "pages/ForgotPassword.tsx",
    "pages/Login.tsx",
    "pages/PostDetail.tsx",
    "pages/PublicProfile.tsx",
    "pages/Register.tsx",
    "pages/ReportPost.tsx",
    "pages/ResetPassword.tsx",
    "pages/Settings.tsx",
  ],
  "testo-primario": [],
  "accento-lime": [
    "pages/PublicProfile.tsx",
  ],
  gradiente: [
    "components/ActivityInsightNotification.tsx",
    "components/BadgeUnlockNotification.tsx",
    "components/DirectMessages.tsx",
    "components/PbCelebrationNotification.tsx",
    "components/club/ClubFeedTab.tsx",
    "components/club/ClubHero.tsx",
    "components/club/HistoryMetricCircle.tsx",
    "components/metrics/MetricOrb.tsx",
    "components/onboarding/OnboardingWelcomeComposition.tsx",
    "pages/AuthCallback.tsx",
    "pages/Badges.tsx",
    "pages/Challenges.tsx",
    "pages/ClubHistoryAthletesPage.tsx",
    "pages/ClubHistoryMeetsPage.tsx",
    "pages/ForgotPassword.tsx",
    "pages/Home.tsx",
    "pages/Login.tsx",
    "pages/NotFound.tsx",
    "pages/PublicProfile.tsx",
    "pages/Register.tsx",
    "pages/ResetPassword.tsx",
    "pages/Settings.tsx",
  ],
  sfocatura: [
    "components/ActivityInsightNotification.tsx",
    "components/BadgeUnlockNotification.tsx",
    "components/CookieBanner.tsx",
    "components/PbCelebrationNotification.tsx",
    "components/club/HistoryMetricCircle.tsx",
    "components/metrics/MetricOrb.tsx",
    "pages/Badges.tsx",
    "pages/ClubEventDetail.tsx",
    "pages/ClubInvite.tsx",
    "pages/Home.tsx",
    "pages/NotFound.tsx",
    "pages/StravaConnect.tsx",
  ],
  "titolo-pagina": [
    "components/club/ClubHero.tsx",
    "components/onboarding/OnboardingWelcomeComposition.tsx",
    "pages/AdminReports.tsx",
    "pages/ChallengeDetail.tsx",
    "pages/Challenges.tsx",
    "pages/ClubCoachModeration.tsx",
    "pages/ClubDocumentsPage.tsx",
    "pages/ClubEventDetail.tsx",
    "pages/ClubHistoryAthletesPage.tsx",
    "pages/ClubHistoryMeetsPage.tsx",
    "pages/ClubInvite.tsx",
    "pages/ClubMeetDetail.tsx",
    "pages/ClubMeetProgramBuilder.tsx",
    "pages/ClubPbLeaderboardPage.tsx",
    "pages/ClubWorkoutDetailPage.tsx",
    "pages/ClubWorkoutsPage.tsx",
    "pages/Messages.tsx",
    "pages/NotFound.tsx",
    "pages/PublicProfile.tsx",
    "pages/ReportPost.tsx",
    "pages/Settings.tsx",
  ],
  "colore-fisso": [
    "components/ActivityInsightNotification.tsx",
    "components/BadgeUnlockNotification.tsx",
    "components/PbCelebrationNotification.tsx",
    "components/club/ClubFeedTab.tsx",
    "components/club/ClubHero.tsx",
    "components/club/HistoryMetricCircle.tsx",
    "components/club/QuickActionsFAB.tsx",
    "components/onboarding/OnboardingFlow.tsx",
    "components/ui/dialog.tsx",
    "components/ui/sheet.tsx",
    "lib/social-content.tsx",
    "pages/AuthCallback.tsx",
    "pages/Badges.tsx",
    "pages/ClubDetailEnhanced.tsx",
    "pages/ClubInvite.tsx",
    "pages/ForgotPassword.tsx",
    "pages/Home.tsx",
    "pages/Login.tsx",
    "pages/NotFound.tsx",
    "pages/Register.tsx",
    "pages/ResetPassword.tsx",
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
  it("testo-piccolo: px e rem decimali sotto i 12px, 0.75rem ammesso", () => {
    const rule = RULES["testo-piccolo"];
    for (const bad of ["text-[10px]", "text-[11.5px]", "text-[9.75px]", "text-[0.7rem]", "text-[0.74rem]", "text-[0.625rem]", "text-[0.6rem]"]) {
      expect(rule.test(bad), bad).toBe(true);
    }
    for (const ok of ["text-[12px]", "text-[0.75rem]", "text-[0.8rem]", "text-[15px]", "text-[17px]"]) {
      expect(rule.test(ok), ok).toBe(false);
    }
  });

  it("ogni esenzione corrisponde ancora alla sua regola", () => {
    const stale = (Object.entries(EXEMPT) as Array<[Rule, readonly string[]]>).flatMap(
      ([rule, files]) =>
        files
          .filter(file => !RULES[rule].test(contents.get(file) ?? ""))
          .map(file => `${rule}: ${file}`)
    );
    expect(stale).toEqual([]);
  });

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
