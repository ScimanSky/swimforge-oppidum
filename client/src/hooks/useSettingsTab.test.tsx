import { act, cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { useSettingsTab } from "./useSettingsTab";

function setup(searchPath: string) {
  const location = memoryLocation({ path: "/settings", searchPath, record: true });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Router hook={location.hook} searchHook={location.searchHook}>
      {children}
    </Router>
  );
  return { ...renderHook(() => useSettingsTab(), { wrapper }), location };
}

describe("useSettingsTab", () => {
  afterEach(cleanup);

  it("legge la scheda e il flag di onboarding dalla query", () => {
    const { result } = setup("tab=connections&onboarding=1");
    expect(result.current.activeTab).toBe("connections");
    expect(result.current.onboarding).toBe(true);
  });

  it("senza query o con una scheda sconosciuta apre il profilo", () => {
    expect(setup("").result.current).toMatchObject({ activeTab: "profile", onboarding: false });
    cleanup();
    expect(setup("tab=boh").result.current.activeTab).toBe("profile");
  });

  it("selectTab aggiorna l'URL mantenendo gli altri parametri", () => {
    const { result, location } = setup("tab=profile&onboarding=1");
    act(() => result.current.selectTab("connections"));
    expect(result.current.activeTab).toBe("connections");
    expect(location.history.at(-1)).toBe("/settings?tab=connections&onboarding=1");
  });

  it("cambiare scheda (anche con le frecce) non aggiunge voci alla cronologia: «Indietro» lascia le impostazioni", () => {
    const { result, location } = setup("tab=profile");
    act(() => result.current.selectTab("connections"));
    act(() => result.current.selectTab("notifications"));
    act(() => result.current.selectTab("preferences"));
    expect(result.current.activeTab).toBe("preferences");
    expect(location.history).toEqual(["/settings?tab=preferences"]);
  });

  it("segue l'URL quando cambia da fuori", () => {
    const { result, location } = setup("tab=profile");
    act(() => location.navigate("/settings?tab=privacy"));
    expect(result.current.activeTab).toBe("privacy");
  });
});
