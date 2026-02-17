export const ONBOARDING_CONSENT_TYPE = "product_onboarding_tour" as const;
export const ONBOARDING_CONSENT_VERSION = "v1.0" as const;

export const ONBOARDING_STORAGE_KEY = "swimforge:onboarding:completed:v1";

export const ONBOARDING_FORCE_QUERY_PARAM = "onboarding";

export function isOnboardingCompletedLocally(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(ONBOARDING_STORAGE_KEY) === "1";
}

export function setOnboardingCompletedLocally(value: boolean): void {
  if (typeof window === "undefined") return;
  if (value) {
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, "1");
  } else {
    window.localStorage.removeItem(ONBOARDING_STORAGE_KEY);
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
