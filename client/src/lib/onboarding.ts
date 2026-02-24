export const ONBOARDING_CONSENT_TYPE = "product_onboarding_tour" as const;
export const ONBOARDING_CONSENT_VERSION = "v1.0" as const;

export const ONBOARDING_STORAGE_KEY = "swimforge:onboarding:completed:v1";

export const ONBOARDING_FORCE_QUERY_PARAM = "onboarding";

function getScopedOnboardingStorageKey(userId?: string | number | null): string {
  if (userId === undefined || userId === null || userId === "") return ONBOARDING_STORAGE_KEY;
  return `${ONBOARDING_STORAGE_KEY}:${String(userId)}`;
}

export function isOnboardingCompletedLocally(userId?: string | number | null): boolean {
  if (typeof window === "undefined") return false;
  const scopedKey = getScopedOnboardingStorageKey(userId);
  return window.localStorage.getItem(scopedKey) === "1";
}

export function setOnboardingCompletedLocally(
  value: boolean,
  userId?: string | number | null
): void {
  if (typeof window === "undefined") return;
  const scopedKey = getScopedOnboardingStorageKey(userId);
  if (value) {
    window.localStorage.setItem(scopedKey, "1");
  } else {
    window.localStorage.removeItem(scopedKey);
  }
}

export function stripOnboardingParams(rawLocation: string): string {
  const [path, queryString] = rawLocation.split("?");
  if (!queryString) return rawLocation;

  const params = new URLSearchParams(queryString);
  params.delete("onboarding");
  params.delete("tour");

  const nextQuery = params.toString();
  return nextQuery ? `${path}?${nextQuery}` : path;
}

export type OnboardingRole = "athlete" | "coach";

export const ONBOARDING_IDENTITY_STORAGE_KEY = "swimforge:onboarding:identity:v1";

export function getOnboardingIdentityLocally(userId?: string | number | null): {
  role?: OnboardingRole;
  completed?: boolean;
} {
  if (typeof window === "undefined") return {};
  const key = `${ONBOARDING_IDENTITY_STORAGE_KEY}:${userId ?? "anon"}`;
  try {
    return JSON.parse(window.localStorage.getItem(key) ?? "{}");
  } catch {
    return {};
  }
}

export function setOnboardingIdentityLocally(
  data: { role?: OnboardingRole; completed?: boolean },
  userId?: string | number | null
): void {
  if (typeof window === "undefined") return;
  const key = `${ONBOARDING_IDENTITY_STORAGE_KEY}:${userId ?? "anon"}`;
  window.localStorage.setItem(key, JSON.stringify(data));
}
