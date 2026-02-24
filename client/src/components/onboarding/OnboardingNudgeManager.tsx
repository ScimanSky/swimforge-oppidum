import { useEffect } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import {
  isOnboardingCompletedLocally,
  getShownNudges,
  markNudgeShown,
  type NudgeId,
} from "@/lib/onboarding";

type Props = {
  userId: string | number;
};

const SESSION_NUDGE_KEY = "swimforge:nudge:session";

function hasShownNudgeThisSession(): boolean {
  if (typeof sessionStorage === "undefined") return false;
  return sessionStorage.getItem(SESSION_NUDGE_KEY) === "1";
}

function markNudgeShownThisSession(): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(SESSION_NUDGE_KEY, "1");
}

export function OnboardingNudgeManager({ userId }: Props) {
  const onboardingDone = isOnboardingCompletedLocally(userId);

  // activities.list returns an array of activities directly
  const { data: activitiesData } = trpc.activities.list.useQuery(
    { limit: 5 },
    { enabled: onboardingDone, staleTime: 60_000 }
  );

  // profile.get returns the full swimmer profile (includes totalSessions)
  const { data: profileData } = trpc.profile.get.useQuery(undefined, {
    enabled: onboardingDone,
    staleTime: 60_000,
  });

  // community.clubs.list with scope "mine" returns clubs the user belongs to
  const { data: myClubsData } = trpc.community.clubs.list.useQuery(
    { scope: "mine", limit: 1 },
    { enabled: onboardingDone, staleTime: 60_000 }
  );

  useEffect(() => {
    if (!onboardingDone) return;
    if (hasShownNudgeThisSession()) return;

    // Wait for at least one query to resolve before deciding
    const hasAnyData = activitiesData !== undefined || profileData !== undefined || myClubsData !== undefined;
    if (!hasAnyData) return;

    const shownNudges = getShownNudges(userId);

    // Activities come back as a plain array
    const activityCount = activitiesData?.length ?? profileData?.totalSessions ?? 0;

    // User has a club if the "mine" scoped list is non-empty
    const hasClub = Array.isArray(myClubsData) && myClubsData.length > 0;

    const candidates: Array<{ id: NudgeId; message: string; condition: boolean }> = [
      {
        id: "first-season",
        message: "Partecipa alla Season! +50 XP ti aspettano in classifica.",
        condition: activityCount >= 1 && !shownNudges.includes("first-season"),
      },
      {
        id: "try-coach",
        message: "Hai gia 3 attivita! Prova l'AI Coach per un piano personalizzato.",
        condition: activityCount >= 3 && !shownNudges.includes("try-coach"),
      },
      {
        id: "find-club",
        message: "Il tuo club e su SwimForge? Cercalo nella sezione Community.",
        condition: !hasClub && !shownNudges.includes("find-club"),
      },
    ];

    const nudge = candidates.find((c) => c.condition);
    if (!nudge) return;

    const timeout = window.setTimeout(() => {
      toast(nudge.message, {
        duration: 6000,
        position: "bottom-center",
      });
      markNudgeShown(nudge.id, userId);
      markNudgeShownThisSession();
    }, 3000);

    return () => window.clearTimeout(timeout);
  }, [activitiesData, myClubsData, onboardingDone, profileData, userId]);

  return null;
}
