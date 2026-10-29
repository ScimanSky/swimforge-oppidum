import { useEffect, useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";

export const SETTINGS_TABS = [
  "profile",
  "connections",
  "notifications",
  "preferences",
  "privacy",
] as const;
const ALLOWED = new Set<string>(SETTINGS_TABS);

/**
 * Settings tab and onboarding flag from the query string (`?tab=connections&onboarding=1`).
 * wouter's useLocation() is the pathname only: the query comes from useSearch().
 */
export function useSettingsTab() {
  const [location, navigate] = useLocation();
  const search = useSearch();
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const onboarding = params.get("onboarding") === "1";
  const tab = params.get("tab");
  const tabFromUrl = tab && ALLOWED.has(tab) ? tab : "profile";

  const [activeTab, setActiveTab] = useState(tabFromUrl);
  useEffect(() => {
    setActiveTab(tabFromUrl);
  }, [tabFromUrl]);

  // Replace, not push: moving between tabs (the arrow keys move one at a time) must not fill
  // the history, so «Indietro» leaves the settings instead of walking back through the tabs.
  const selectTab = (nextTab: string) => {
    const nextParams = new URLSearchParams(params);
    nextParams.set("tab", nextTab);
    setActiveTab(nextTab);
    navigate(`${location || "/settings"}?${nextParams.toString()}`, { replace: true });
  };

  return { activeTab, selectTab, onboarding };
}
